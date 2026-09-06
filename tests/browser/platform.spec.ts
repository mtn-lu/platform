import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { createTestHarness } from "wrangler";
import { createServer, type Server } from "node:https";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const origin = "https://mtn.test:8443";
const games = "https://games.mtn.test:8443";
const harness = createTestHarness({
  workers: [
    {
      configPath: "./dist/mtn_platform_local/wrangler.json",
      vars: {
        APP_ENV: "test",
        CANONICAL_ORIGIN: origin,
        RETURN_ORIGINS: `${origin},${games}`,
        LINK_ADDRESS_LIMIT: "3",
        LINK_IP_LIMIT: "20",
        DAILY_EMAIL_LIMIT: "50",
        CONFIRM_IP_LIMIT: "30",
      },
      secrets: {
        AUTH_SECRET: randomBytes(48).toString("base64url"),
        THROTTLE_SECRET: randomBytes(48).toString("base64url"),
      },
    },
    { configPath: "./tests/fixtures/consumer/wrangler.jsonc" },
  ],
});
let db: CloudflareEnv["DB"];
let server: Server | undefined;
test.beforeAll(async () => {
  await harness.listen();
  const root = harness.getWorker<CloudflareEnv>("mtn-platform-local");
  await root.applyD1Migrations("DB");
  db = (await root.getEnv()).DB;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS dev_email(id INTEGER PRIMARY KEY,to_address TEXT,text TEXT,html TEXT,created_at INTEGER)",
  );
  server = createServer(
    {
      key: readFileSync(".local/tls/key.pem"),
      cert: readFileSync(".local/tls/cert.pem"),
    },
    (req, res) => {
      void (async () => {
        const host = req.headers.host;
        if (host !== "mtn.test:8443" && host !== "games.mtn.test:8443") {
          res.writeHead(403).end();
          return;
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          if (Buffer.isBuffer(chunk)) chunks.push(chunk);
        }
        const target = harness.getWorker(
          host === "mtn.test:8443" ? "mtn-platform-local" : "mtn-consumer-test",
        );
        const method = req.method ?? "GET";
        const r = await target.fetch(`https://${host}${req.url ?? "/"}`, {
          method,
          headers: Object.fromEntries(headers.entries()),
          redirect: "manual",
          ...(method === "GET" || method === "HEAD"
            ? {}
            : { body: Buffer.concat(chunks) }),
        });
        res.statusCode = r.status;
        r.headers.forEach((value, key) => {
          if (key !== "set-cookie") res.setHeader(key, value);
        });
        res.setHeader("Set-Cookie", r.headers.getSetCookie());
        res.end(Buffer.from(await r.arrayBuffer()));
      })().catch(() => {
        res.writeHead(503).end("Local test harness unavailable");
      });
    },
  );
  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(8443, "127.0.0.1", resolve);
  });
});
test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => {
      server?.close(() => {
        resolve();
      });
    });
  await harness.close();
});
test.beforeEach(async () => {
  await db.batch(
    [
      "DELETE FROM session",
      "DELETE FROM account",
      "DELETE FROM user",
      "DELETE FROM verification",
      "DELETE FROM platform_access",
      "DELETE FROM throttle",
      "DELETE FROM dev_email",
    ].map((sql) => db.prepare(sql)),
  );
  await db
    .prepare("INSERT INTO platform_access VALUES(?,1,0,0)")
    .bind("friend@example.test")
    .run();
});
async function capturedUrl() {
  const row = await db
    .prepare("SELECT text FROM dev_email ORDER BY id DESC LIMIT 1")
    .first<{ text: string }>();
  const url = row?.text.match(/https?:\/\/\S+/u)?.[0];
  if (!url) throw new Error("Missing captured email");
  return url;
}
test("real login, deliberate confirmation, shared cookie RPC, logout and revocation", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/login");
  await page.getByLabel("Email address").fill("friend@example.test");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email." }),
  ).toBeVisible();
  const url = await capturedUrl();
  await page.goto(url);
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(origin + "/login/confirm");
  expect(await db.prepare("SELECT * FROM session").first()).toBeNull();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Friend." }),
  ).toBeVisible();
  const cookies = await context.cookies();
  const session = cookies.find(
    (c) => c.name === "__Secure-mtn-test.session_token",
  );
  expect(session).toMatchObject({
    domain: ".mtn.test",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });
  const consumer = await page.goto(games);
  expect(consumer?.status()).toBe(200);
  const body = (await consumer?.json()) as unknown;
  expect(body).toMatchObject({ user: { version: 1, name: "Friend" } });
  expect(JSON.stringify(body)).not.toMatch(/token|email|cookie/iu);
  await page.goto(origin + "/account");
  await page
    .getByRole("button", { name: "Sign out here", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Come on in." }),
  ).toBeVisible();
  expect((await page.goto(games))?.status()).toBe(401);
  // New login, then revoke membership without deleting the user.
  await page.goto(origin + "/login");
  await page.getByLabel("Email address").fill("friend@example.test");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email." }),
  ).toBeVisible();
  await page.goto(await capturedUrl());
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Friend." }),
  ).toBeVisible();
  await db.exec("UPDATE platform_access SET enabled=0");
  expect((await page.goto(games))?.status()).toBe(401);
  expect(errors).toEqual([]);
});
test("expired link recovery, deep links, keyboard and accessible responsive screens", async ({
  page,
}, info) => {
  await page.goto(origin);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.screenshot({
    path: `test-results/home-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto(origin + "/login");
  await page.getByLabel("Email address").fill("friend@example.test");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email." }),
  ).toBeVisible();
  await db
    .prepare("UPDATE verification SET expiresAt=?")
    .bind(new Date(Date.now() - 1000).toISOString())
    .run();
  await page.goto(await capturedUrl());
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Request a new link" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto(origin + "/account");
  await expect(
    page.getByRole("heading", { name: "Your place is here." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  const missing = await page.goto(origin + "/api/unknown");
  expect(missing?.status()).toBe(404);
  expect(await missing?.text()).not.toContain("<html");
});
