import { Hono } from "hono";
import { z } from "zod";
import { requestLinkSchema, confirmSchema } from "../shared/contracts.ts";
import { config } from "./config.ts";
import { hasAccess } from "./access.ts";
import { createAuth, currentSession } from "./auth.ts";
import { quota } from "./throttle.ts";
import { csrf, jsonBody, HttpError, copyCookies } from "./http.ts";
import { returnDestination } from "./return-to.ts";
import { cleanup } from "./maintenance.ts";
const app = new Hono<{
  Bindings: CloudflareEnv;
  Variables: { requestId: string };
}>();
app.use("*", async (c, next) => {
  if (c.req.path !== "/api" && !c.req.path.startsWith("/api/")) {
    await next();
    return;
  }
  c.set("requestId", crypto.randomUUID());
  c.header("Cache-Control", "no-store");
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  const started = performance.now();
  await next();
  c.header("X-Request-Id", c.get("requestId"));
  console.log(
    JSON.stringify({
      event: "http",
      code: String(c.res.status),
      requestId: c.get("requestId"),
      durationMs: Math.round(performance.now() - started),
    }),
  );
});
app.use("/api/*", async (c, next) => {
  const cfg = config(c.env);
  if (new URL(c.req.url).origin !== cfg.CANONICAL_ORIGIN)
    throw new HttpError("UNTRUSTED_HOST", 403);
  if (c.req.method !== "GET" && c.req.method !== "HEAD")
    csrf(c.req.raw, cfg.CANONICAL_ORIGIN);
  await next();
});
function destination(env: CloudflareEnv, value: string | undefined) {
  const c = config(env);
  try {
    return returnDestination(value, c.CANONICAL_ORIGIN, c.returnOrigins);
  } catch {
    throw new HttpError("INVALID_RETURN", 400);
  }
}
function ip(request: Request, env: CloudflareEnv): string {
  if (config(env).APP_ENV !== "production") return "local-loopback";
  const value = request.headers.get("cf-connecting-ip");
  if (!value || !z.ipv4().or(z.ipv6()).safeParse(value).success)
    throw new HttpError("CLIENT_UNAVAILABLE", 503);
  return value;
}
app.get("/api/health", (c) => c.json({ status: "ok" }));
app.post("/api/auth/request-link", async (c) => {
  const cfg = config(c.env);
  const body = await jsonBody(c.req.raw, requestLinkSchema);
  const returnTo = destination(c.env, body.returnTo);
  const allowed = await Promise.all([
    quota(
      c.env.DB,
      cfg.THROTTLE_SECRET,
      "link-address",
      body.email,
      cfg.LINK_ADDRESS_LIMIT,
      900,
    ),
    quota(
      c.env.DB,
      cfg.THROTTLE_SECRET,
      "link-ip",
      ip(c.req.raw, c.env),
      cfg.LINK_IP_LIMIT,
      900,
    ),
  ]);
  if (allowed.includes(false)) {
    c.header("Retry-After", "900");
    throw new HttpError("RATE_LIMITED", 429);
  }
  const accepted = { accepted: true } as const;
  if (await hasAccess(c.env.DB, body.email)) {
    // Budget exhaustion and delivery failures have the same public acknowledgement.
    if (
      await quota(
        c.env.DB,
        cfg.THROTTLE_SECRET,
        "email-budget",
        "all",
        cfg.DAILY_EMAIL_LIMIT,
        86400,
      )
    ) {
      try {
        await createAuth(c.env, returnTo).api.signInMagicLink({
          body: { email: body.email, name: "Friend" },
          headers: c.req.raw.headers,
        });
        console.log(
          JSON.stringify({
            event: "delivery",
            code: "ACCEPTED",
            requestId: c.get("requestId"),
          }),
        );
      } catch {
        console.warn(
          JSON.stringify({
            event: "delivery",
            code: "UNAVAILABLE",
            requestId: c.get("requestId"),
          }),
        );
      }
    }
  }
  return c.json(accepted, 202);
});
app.post("/api/auth/confirm", async (c) => {
  const cfg = config(c.env);
  if (
    !(await quota(
      c.env.DB,
      cfg.THROTTLE_SECRET,
      "confirm-ip",
      ip(c.req.raw, c.env),
      cfg.CONFIRM_IP_LIMIT,
      900,
    ))
  )
    throw new HttpError("RATE_LIMITED", 429);
  const body = await jsonBody(c.req.raw, confirmSchema);
  const returnTo = destination(c.env, body.returnTo);
  const auth = createAuth(c.env);
  // Never mount the GET verifier. This server API retains library hooks.
  const result = await auth.api.magicLinkVerify({
    query: { token: body.token },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  if (!result.ok) throw new HttpError("INVALID_LINK", 400);
  // Validate the issued cookie through the same policy before sending it out.
  const cookie = result.headers
    .getSetCookie()
    .map((s) => s.split(";")[0] ?? "")
    .join("; ");
  if (!(await currentSession(c.env, cookie)))
    throw new HttpError("INVALID_LINK", 400);
  const response = new Response(
    JSON.stringify({ returnTo: destination(c.env, returnTo) }),
    { headers: { "Content-Type": "application/json" } },
  );
  copyCookies(result.headers, response.headers);
  return response;
});
app.get("/api/me", async (c) => {
  const s = await currentSession(c.env, c.req.header("cookie") ?? "");
  if (!s) return c.json({ user: null }, 401);
  return c.json({
    user: {
      version: 1,
      id: s.user.id,
      name: s.user.name,
      email: s.user.email,
      expiresAt: s.session.expiresAt.toISOString(),
    },
  });
});
for (const path of ["/api/auth/logout", "/api/auth/logout-all"])
  app.post(path, async (c) => {
    await jsonBody(c.req.raw, z.object({}).strict());
    const auth = createAuth(c.env);
    const s = await currentSession(c.env, c.req.header("cookie") ?? "");
    if (path.endsWith("logout-all")) {
      if (!s) throw new HttpError("UNAUTHENTICATED", 401);
      await auth.api.revokeSessions({ headers: c.req.raw.headers });
    } else if (s) {
      await auth.api.revokeSession({
        body: { token: s.session.token },
        headers: c.req.raw.headers,
      });
    }
    const result = await auth.api.signOut({
      headers: c.req.raw.headers,
      asResponse: true,
    });
    const response = new Response(JSON.stringify({ accepted: true }), {
      headers: { "Content-Type": "application/json" },
    });
    copyCookies(result.headers, response.headers);
    return response;
  });
for (const [path, method] of [
  ["/api/health", "GET, HEAD"],
  ["/api/me", "GET, HEAD"],
  ["/api/auth/request-link", "POST"],
  ["/api/auth/confirm", "POST"],
  ["/api/auth/logout", "POST"],
  ["/api/auth/logout-all", "POST"],
]) {
  if (path && method)
    app.all(path, (c) => {
      c.header("Allow", method);
      return c.json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    });
}
app.notFound((c) =>
  c.req.path === "/api" || c.req.path.startsWith("/api/")
    ? c.json({ error: { code: "NOT_FOUND" } }, 404)
    : c.env.ASSETS.fetch(c.req.raw),
);
app.onError((error, c) =>
  c.json(
    {
      error: { code: error instanceof HttpError ? error.code : "UNAVAILABLE" },
    },
    error instanceof HttpError ? error.status : 503,
  ),
);
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: CloudflareEnv) {
    await cleanup(env);
  },
} satisfies ExportedHandler<CloudflareEnv>;

export { SessionValidation } from "./session-entrypoint.ts";
