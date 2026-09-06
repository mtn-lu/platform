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
      (await exports.default.fetch(origin + "/api/me", { headers: { cookie } })).status,
    ).toBe(200);
    expect((await post("/api/auth/confirm", { token: t })).status).toBe(400);
    expect((await post("/api/auth/logout", {}, cookie)).status).toBe(200);
    expect(
      (await exports.default.fetch(origin + "/api/me", { headers: { cookie } })).status,
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
