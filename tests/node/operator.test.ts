import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { sqlString } from "../../scripts/sql.ts";
import { validateProduction } from "../../scripts/preflight.ts";
import { sendWithResend } from "../../worker/resend.ts";
await test("SQL literal serialization round-trips hostile input", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const value of [
      "o'brien@example.test",
      "'); DROP TABLE user; --",
      "line\nnext",
      "back\\slash",
    ]) {
      const row = db.prepare(`SELECT ${sqlString(value)} AS value`).get();
      assert.equal(row?.value, value);
    }
    assert.throws(() => sqlString("nul\0byte"));
  } finally {
    db.close();
  }
});
await test("operator rejects remote operation without a complete preflight", () => {
  const r = spawnSync(
    process.execPath,
    ["scripts/access.ts", "grant", "friend@example.test", "--remote"],
    { encoding: "utf8" },
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Preflight rejected/u);
});
await test("production preflight rejects placeholders, missing secrets and capture", () => {
  assert.throws(() => {
    validateProduction({}, {});
  });
  const valid = {
    name: "mtn-platform",
    account_id: "1".repeat(32),
    workers_dev: false,
    preview_urls: false,
    compatibility_date: "2026-09-06",
    vars: {
      APP_ENV: "production",
      CANONICAL_ORIGIN: "https://mtn.lu",
      RETURN_ORIGINS: "https://mtn.lu",
      EMAIL_MODE: "resend",
      EMAIL_FROM: "sender@example.test",
    },
    d1_databases: [
      {
        binding: "DB",
        database_id: "11111111-1111-4111-8111-111111111111",
        database_name: "identity",
      },
    ],
    routes: [{ pattern: "mtn.lu", custom_domain: true }],
  };
  const secrets = {
    AUTH_SECRET: "a".repeat(64),
    THROTTLE_SECRET: "b".repeat(64),
    RESEND_API_KEY: `re_${"c".repeat(61)}`,
  };
  assert.doesNotThrow(() => {
    validateProduction(valid, secrets);
  });
  assert.throws(() => {
    validateProduction(valid, {});
  });
  assert.throws(() => {
    validateProduction(
      { ...valid, vars: { ...valid.vars, EMAIL_MODE: "capture" } },
      secrets,
    );
  });
  assert.throws(() => {
    validateProduction({ ...valid, workers_dev: true }, secrets);
  });
  assert.throws(() => {
    validateProduction({ ...valid, send_email: [{ name: "EMAIL" }] }, secrets);
  });
  assert.throws(() => {
    validateProduction(valid, { ...secrets, RESEND_API_KEY: "not-resend" });
  });
});
await test("Resend transport sends a bounded transactional request", async () => {
  let request: { input: string; init: RequestInit | undefined } | undefined;
  await sendWithResend(
    { apiKey: `re_${"c".repeat(61)}`, from: "login@auth.mtn.lu" },
    {
      to: "friend@example.test",
      url: "https://mtn.lu/confirm#token=synthetic",
      text: "plain",
      html: "<p>html</p>",
    },
    (input, init) => {
      request = { input: String(input), init };
      return Promise.resolve(new Response(null, { status: 200 }));
    },
  );
  assert.ok(request);
  assert.equal(request.input, "https://api.resend.com/emails");
  const headers = new Headers(request.init?.headers);
  assert.equal(headers.get("authorization"), `Bearer re_${"c".repeat(61)}`);
  assert.match(
    headers.get("idempotency-key") ?? "",
    /^mtn-login-[a-f0-9]{64}$/u,
  );
  const body = request.init?.body;
  assert.equal(typeof body, "string");
  if (typeof body !== "string") throw new Error("Missing Resend request body");
  assert.deepEqual(JSON.parse(body), {
    from: "login@auth.mtn.lu",
    to: ["friend@example.test"],
    subject: "Your mtn.lu sign-in link",
    text: "plain",
    html: "<p>html</p>",
  });
});
await test("Resend transport hides provider errors", async () => {
  await assert.rejects(
    sendWithResend(
      { apiKey: `re_${"c".repeat(61)}`, from: "login@auth.mtn.lu" },
      {
        to: "friend@example.test",
        url: "https://mtn.lu/confirm#token=synthetic",
        text: "plain",
        html: "<p>html</p>",
      },
      () =>
        Promise.resolve(
          new Response('{"message":"provider detail"}', { status: 422 }),
        ),
    ),
    { message: "DELIVERY_UNAVAILABLE" },
  );
  await assert.rejects(
    sendWithResend(
      { apiKey: `re_${"c".repeat(61)}`, from: "login@auth.mtn.lu" },
      {
        to: "friend@example.test",
        url: "https://mtn.lu/confirm#token=synthetic",
        text: "plain",
        html: "<p>html</p>",
      },
      () => Promise.reject(new Error("provider network detail")),
    ),
    { message: "DELIVERY_UNAVAILABLE" },
  );
});
