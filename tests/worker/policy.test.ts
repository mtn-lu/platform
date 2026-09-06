import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, it, expect } from "vitest";
import { config } from "../../worker/config.ts";
import { createAuth } from "../../worker/auth.ts";
import { cleanup } from "../../worker/maintenance.ts";
import { emailTransport, escapeHtml } from "../../worker/email.ts";
import { getMigrations } from "better-auth/db/migration";
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.exec(
    "CREATE TABLE dev_email(id INTEGER PRIMARY KEY,to_address TEXT,text TEXT,html TEXT,created_at INTEGER)",
  );
});
beforeEach(async () => {
  await env.DB.batch(
    [
      "DELETE FROM verification",
      "DELETE FROM throttle",
      "DELETE FROM dev_email",
    ].map((sql) => env.DB.prepare(sql)),
  );
});
it("matches the installed schema and preserves required library tables", async () => {
  const plan = await getMigrations(createAuth(env).options);
  expect(plan.toBeCreated).toEqual([]);
  expect(plan.toBeAdded).toEqual([]);
  expect(plan.toBeAddedIndexes).toEqual([]);
});
it("fails closed for incomplete production settings and unsafe local origins", () => {
  expect(() => config({ ...env, APP_ENV: "production" })).toThrow();
  expect(() => config({ ...env, AUTH_SECRET: "" })).toThrow();
  expect(() =>
    config({ ...env, CANONICAL_ORIGIN: "https://evil.test" }),
  ).toThrow();
  expect(() =>
    config({
      ...env,
      APP_ENV: "production",
      CANONICAL_ORIGIN: "https://mtn.lu",
      EMAIL_MODE: "capture",
    }),
  ).toThrow();
});
it("uses library production cookie attributes without sending network traffic", async () => {
  const production = {
    ...env,
    APP_ENV: "production",
    CANONICAL_ORIGIN: "https://mtn.lu",
    RETURN_ORIGINS: "https://mtn.lu",
    EMAIL_MODE: "cloudflare",
    EMAIL_FROM: "sender@example.test",
    EMAIL: { send: () => Promise.resolve({ messageId: "synthetic" }) },
  } satisfies CloudflareEnv;
  const context = await createAuth(production).$context;
  expect(context.authCookies.sessionToken).toMatchObject({
    name: "__Secure-mtn.session_token",
    attributes: {
      domain: "mtn.lu",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    },
  });
  const local = await createAuth(env).$context;
  expect(local.authCookies.sessionToken.attributes.domain).toBeUndefined();
});
it("uses structured email, escapes HTML, and propagates failures without fallback", async () => {
  const sent: unknown[] = [];
  const production = {
    ...env,
    APP_ENV: "production",
    CANONICAL_ORIGIN: "https://mtn.lu",
    RETURN_ORIGINS: "https://mtn.lu",
    EMAIL_MODE: "cloudflare",
    EMAIL_FROM: "sender@example.test",
    EMAIL: {
      send: (message) => {
        sent.push(message);
        return Promise.resolve({ messageId: "synthetic" });
      },
    },
  } satisfies CloudflareEnv;
  await emailTransport(production).send({
    to: "friend@example.test",
    url: "https://mtn.test/login/confirm#synthetic",
  });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    to: "friend@example.test",
    from: "sender@example.test",
    subject: "Your mtn.lu sign-in link",
  });
  expect(escapeHtml("<\"&'>")).toBe("&lt;&quot;&amp;&#39;&gt;");
  await expect(
    emailTransport({
      ...production,
      EMAIL: { send: () => Promise.reject(new Error("provider detail")) },
    }).send({
      to: "friend@example.test",
      url: "https://mtn.test/login/confirm#synthetic",
    }),
  ).rejects.toThrow();
  expect(await env.DB.prepare("SELECT * FROM dev_email").first()).toBeNull();
});
it("cleans expired rows in bounded batches, retaining live rows", async () => {
  const old = new Date(Date.now() - 10000).toISOString();
  const future = new Date(Date.now() + 100000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO verification VALUES(?,?,?,?,?,?)").bind(
      "old",
      "hashed-old",
      "{}",
      old,
      old,
      old,
    ),
    env.DB.prepare("INSERT INTO verification VALUES(?,?,?,?,?,?)").bind(
      "live",
      "hashed-live",
      "{}",
      future,
      old,
      old,
    ),
    env.DB.prepare("INSERT INTO throttle VALUES(?,1,0)").bind("expired"),
    env.DB.prepare("INSERT INTO dev_email VALUES(1,?,?,?,0)").bind(
      "friend@example.test",
      "synthetic",
      "synthetic",
    ),
  ]);
  await cleanup(env);
  expect(
    await env.DB.prepare("SELECT id FROM verification").all(),
  ).toMatchObject({ results: [{ id: "live" }] });
  expect(await env.DB.prepare("SELECT * FROM throttle").first()).toBeNull();
  expect(await env.DB.prepare("SELECT * FROM dev_email").first()).toBeNull();
});
