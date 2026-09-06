import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { hasAccess } from "./access.ts";
import { config } from "./config.ts";
import { emailTransport } from "./email.ts";
import { returnDestination } from "./return-to.ts";
export function createAuth(env: CloudflareEnv, returnTo = "/account") {
  const c = config(env);
  const correlationId = crypto.randomUUID();
  const started = performance.now();
  const destination = returnDestination(
    returnTo,
    c.CANONICAL_ORIGIN,
    c.returnOrigins,
  );
  return betterAuth({
    appName: "mtn.lu",
    baseURL: c.CANONICAL_ORIGIN,
    basePath: "/api/auth",
    secret: c.AUTH_SECRET,
    database: env.DB,
    verification: { disableCleanup: true },
    trustedOrigins: [c.CANONICAL_ORIGIN],
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      disableSessionRefresh: true,
      deferSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix:
        c.APP_ENV === "production"
          ? "mtn"
          : c.APP_ENV === "test"
            ? "mtn-test"
            : "mtn-local",
      useSecureCookies: c.secure,
      defaultCookieAttributes: {
        path: "/",
        httpOnly: true,
        secure: c.secure,
        sameSite: "lax",
        ...(c.cookieDomain ? { domain: c.cookieDomain } : {}),
      },
    },
    // Facade has distributed D1 limits. No library handler is publicly mounted.
    rateLimit: { enabled: false },
    logger: {
      log: () => {
        console.warn(
          JSON.stringify({
            event: "auth_library",
            code: "AUTH_EVENT",
            requestId: correlationId,
            durationMs: Math.round(performance.now() - started),
          }),
        );
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!(await hasAccess(env.DB, user.email)))
              throw new APIError("FORBIDDEN", {
                message: "Access unavailable",
              });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await env.DB.prepare(
              "SELECT email FROM user WHERE id=?",
            )
              .bind(session.userId)
              .first<{ email: string }>();
            if (!user || !(await hasAccess(env.DB, user.email)))
              throw new APIError("FORBIDDEN", {
                message: "Access unavailable",
              });
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 900,
        storeToken: "hashed",
        sendMagicLink: async ({ email, token }) => {
          if (!(await hasAccess(env.DB, email))) return;
          const url = new URL("/login/confirm", c.CANONICAL_ORIGIN);
          url.hash = new URLSearchParams({
            token,
            returnTo: destination,
          }).toString();
          await emailTransport(env).send({ to: email, url: url.href });
        },
      }),
    ],
  });
}
export async function currentSession(env: CloudflareEnv, cookie: string) {
  if (cookie.length > 8192) return null;
  const session = await createAuth(env).api.getSession({
    headers: new Headers({ cookie }),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session || !(await hasAccess(env.DB, session.user.email))) return null;
  return session;
}
