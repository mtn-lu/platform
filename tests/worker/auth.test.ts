import { env, exports } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
const origin = "http://127.0.0.1:5173";
async function post(path: string, body: unknown, cookie = "") {
  return exports.default.fetch(origin + path, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}
async function grant() {
  await env.DB.prepare("INSERT INTO platform_access VALUES(?,1,0,0)")
    .bind("friend@example.test")
    .run();
}
async function token() {
  const row = await env.DB.prepare(
    "SELECT text FROM dev_email ORDER BY id DESC LIMIT 1",
  ).first<{ text: string }>();
  const url = row?.text.match(/https?:\/\/\S+/u)?.[0];
  if (!url) throw new Error("No captured email");
  const value = new URLSearchParams(new URL(url).hash.slice(1)).get("token");
  if (!value) throw new Error("No token");
  return value;
}
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.exec(
    "CREATE TABLE dev_email(id INTEGER PRIMARY KEY,to_address TEXT,text TEXT,html TEXT,created_at INTEGER)",
  );
});
beforeEach(async () => {
  await env.DB.batch(
    [
      "DELETE FROM session",
      "DELETE FROM account",
      "DELETE FROM user",
      "DELETE FROM verification",
      "DELETE FROM platform_access",
      "DELETE FROM throttle",
      "DELETE FROM dev_email",
    ].map((sql) => env.DB.prepare(sql)),
  );
});
describe("public auth on real D1", () => {
  it("denies empty membership neutrally, logs in, rejects replay, logs out", async () => {
    const denied = await post("/api/auth/request-link", {
      email: "friend@example.test",
    });
    expect(denied.status).toBe(202);
    expect(await env.DB.prepare("SELECT * FROM dev_email").first()).toBeNull();
    await grant();
    const allowed = await post("/api/auth/request-link", {
      email: " FRIEND@example.test ",
    });
    expect(allowed.status).toBe(202);
    expect(await allowed.text()).toBe(await denied.text());
    const t = await token();
    const verification = await env.DB.prepare(
      "SELECT identifier FROM verification",
    ).first<{ identifier: string }>();
    expect(verification?.identifier).not.toBe(t);
    const confirmed = await post("/api/auth/confirm", { token: t });
    expect(confirmed.status).toBe(200);
    const cookie = confirmed.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookie).toContain("mtn-local.session_token");
    expect(await confirmed.text()).not.toContain(t);
    expect(
      (await exports.default.fetch(origin + "/api/me", { headers: { cookie } }))
        .status,
    ).toBe(200);
    expect((await post("/api/auth/confirm", { token: t })).status).toBe(400);
    expect((await post("/api/auth/logout", {}, cookie)).status).toBe(200);
    expect(
      (await exports.default.fetch(origin + "/api/me", { headers: { cookie } }))
        .status,
    ).toBe(401);
  });
  it("consumes one link once under concurrent redemption", async () => {
    await grant();
    await post("/api/auth/request-link", { email: "friend@example.test" });
    const t = await token();
    const responses = await Promise.all([
      post("/api/auth/confirm", { token: t }),
      post("/api/auth/confirm", { token: t }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(
      (
        await env.DB.prepare("SELECT count(*) AS n FROM session").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(1);
  });
});

it("rejects hostile origins and malformed/oversized bodies", async () => {
  for (const originHeader of [
    "https://games.mtn.lu",
    "https://evil.test",
    "null",
    "",
  ]) {
    const r = await exports.default.fetch(origin + "/api/auth/request-link", {
      method: "POST",
      headers: { origin: originHeader, "content-type": "application/json" },
      body: '{"email":"friend@example.test"}',
    });
    expect(r.status).toBe(403);
  }
  const malformed = await exports.default.fetch(
    origin + "/api/auth/request-link",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: "{",
    },
  );
  expect(malformed.status).toBe(400);
  expect((await post("/api/auth/request-link", { email: "no" })).status).toBe(
    400,
  );
  expect(
    (await post("/api/auth/request-link", { email: "x".repeat(3000) })).status,
  ).toBe(413);
});
it("blocks verifier, unsupported auth, API fallback and GET/HEAD confirmation", async () => {
  await grant();
  await post("/api/auth/request-link", { email: "friend@example.test" });
  const t = await token();
  for (const method of ["GET", "HEAD"]) {
    for (const path of [
      "/api/auth/magic-link/verify?token=" + t,
      "/api/auth/confirm?token=" + t,
      "/api/auth/sign-up/email",
      "/api/unknown",
      "/api",
    ]) {
      const r = await exports.default.fetch(origin + path, {
        method,
        headers: { "sec-purpose": "prefetch" },
      });
      expect([404, 405]).toContain(r.status);
      expect(r.headers.get("content-type")).toContain("application/json");
    }
  }
  expect((await post("/api/auth/confirm", { token: t })).status).toBe(200);
});
it("revalidates membership for outstanding links and current sessions", async () => {
  await grant();
  await post("/api/auth/request-link", { email: "friend@example.test" });
  const t = await token();
  await env.DB.prepare("UPDATE platform_access SET enabled=0").run();
  expect((await post("/api/auth/confirm", { token: t })).status).toBe(400);
  await env.DB.prepare("UPDATE platform_access SET enabled=1").run();
  await post("/api/auth/request-link", { email: "friend@example.test" });
  const r = await post("/api/auth/confirm", { token: await token() });
  expect(r.status).toBe(200);
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  await env.DB.prepare("UPDATE platform_access SET enabled=0").run();
  expect(
    (await exports.default.fetch(origin + "/api/me", { headers: { cookie } }))
      .status,
  ).toBe(401);
  expect(
    (
      await env.DB.prepare("SELECT count(*) AS n FROM user").first<{
        n: number;
      }>()
    )?.n,
  ).toBe(1);
});
it("rejects expired real tokens and leaves fixed expiry unchanged on reads", async () => {
  await grant();
  await post("/api/auth/request-link", { email: "friend@example.test" });
  const t = await token();
  await env.DB.prepare("UPDATE verification SET expiresAt=?")
    .bind(new Date(Date.now() - 1000).toISOString())
    .run();
  expect((await post("/api/auth/confirm", { token: t })).status).toBe(400);
  await post("/api/auth/request-link", { email: "friend@example.test" });
  const r = await post("/api/auth/confirm", { token: await token() });
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const before = await env.DB.prepare("SELECT * FROM session").first();
  await exports.default.fetch(origin + "/api/me", { headers: { cookie } });
  expect(await env.DB.prepare("SELECT * FROM session").first()).toEqual(before);
  const expiry = await env.DB.prepare("SELECT expiresAt FROM session").first<{
    expiresAt: string;
  }>();
  expect(
    new Date(expiry?.expiresAt ?? "").getTime() - Date.now(),
  ).toBeGreaterThan(29 * 86400000);
  await env.DB.prepare("UPDATE session SET expiresAt=?")
    .bind(new Date(Date.now() - 1000).toISOString())
    .run();
  expect(
    (await exports.default.fetch(origin + "/api/me", { headers: { cookie } }))
      .status,
  ).toBe(401);
  expect(await env.DB.prepare("SELECT * FROM session").first()).not.toBeNull();
});
it("rejects hostile redirects and Host poisoning", async () => {
  for (const returnTo of [
    "//evil.test",
    "https://mtn.lu.evil.test",
    "https://mtn.lu@evil.test",
    "javascript:alert(1)",
    "/\\evil.test",
    "/%2f%2fevil.test",
    "/ok\n",
    "http://127.0.0.1:9999",
    "https://evil.test",
  ])
    expect(
      (
        await post("/api/auth/request-link", {
          email: "friend@example.test",
          returnTo,
        })
      ).status,
    ).toBe(400);
  const r = await exports.default.fetch(
    "https://evil.test/api/auth/request-link",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: '{"email":"friend@example.test"}',
    },
  );
  expect(r.status).toBe(403);
});
it("enforces atomic quotas across independent concurrent requests", async () => {
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      post("/api/auth/request-link", { email: "friend@example.test" }),
    ),
  );
  expect(responses.filter((r) => r.status === 202)).toHaveLength(3);
  expect(responses.filter((r) => r.status === 429)).toHaveLength(5);
  const keys = await env.DB.prepare("SELECT key FROM throttle").all<{
    key: string;
  }>();
  expect(keys.results.every((r) => /^[a-f0-9]{64}$/u.test(r.key))).toBe(true);
});
it("handles capture failure neutrally without exposing provider errors", async () => {
  await grant();
  await env.DB.exec("ALTER TABLE dev_email RENAME TO unavailable_email");
  try {
    const r = await post("/api/auth/request-link", {
      email: "friend@example.test",
    });
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ accepted: true });
  } finally {
    await env.DB.exec("ALTER TABLE unavailable_email RENAME TO dev_email");
  }
});
