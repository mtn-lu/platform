# Testing

## Runtime and operator tests

`npm test` uses @cloudflare/vitest-plugin and cloudflareTest(), Vitest 4, workerd, local D1 and committed migrations. Storage is isolated per test file, **not per test block**. Each file explicitly clears relevant tables before each test. Synthetic test secrets override local secrets; fixtures use example.test addresses. `npm run test:node` checks CLI safeguards and SQL serialization; it does not substitute SQLite mocks for the auth tests.

`npm run types` and `npm run types:consumer` must leave generated files unchanged in a clean checkout. `node scripts/generate-auth-schema.ts` reproduces migration 0001 from the pinned Better Auth migration compiler; review output before committing changes. Do not rerun it over deployed migration history to change an existing schema; add a new ordered migration. A workerd test compares the installed auth options against the actual migrated D1 schema.

## HTTPS browser harness

Prerequisites: OpenSSL, supported Playwright host libraries, and these local DNS/hosts aliases:

```text
127.0.0.1 mtn.test games.mtn.test
```

Add these to `/etc/hosts` (or the Windows hosts file) yourself. CI adds them only to its disposable runner. Do not use production mtn.lu. Port 8443 must be free.

```sh
npx playwright install --with-deps chromium webkit
npm run test:tls
npm run build
npm run test:browser
```

The TLS script generates a disposable two-day certificate/key into ignored `.local/tls`. Delete those two generated files and rerun to rotate. Tests accept this self-signed certificate with ignoreHTTPSErrors; this option is test-only and does not change real browser security. No real private key is committed. No paid Cloudflare account or login is needed.

Playwright starts Wrangler's documented `createTestHarness` against the built root Worker and the test consumer. Storage is ephemeral and distinct from interactive local D1. A loopback HTTPS bridge forwards browser requests with their original hostname/origin to the appropriate Worker. No operator or inbox endpoints are exposed by the bridge. The consumer's AUTH binding targets the real named SessionValidation entrypoint.

Chromium runs at 1280×900; WebKit at 320×740. The core flow requests/captures email, opens confirmation without consuming the token, removes the fragment, clicks Continue, validates cookie attributes, navigates to the sibling consumer, and checks denial after logout and revocation. Other tests cover expired-link recovery, account deep links, keyboard entry, axe, page exceptions and overflow. These are viewport/browser-engine tests, not physical-device tests.

The test named `built Worker service binding smoke without browser binaries` needs no browser executable. Run it alone with:

```sh
npm run test:tls
npm run build
npm run test:browser -- --project=chromium-desktop --grep 'built Worker'
```

It exercises built assets, API routing, the actual service binding, revocation and sanitized logs. It does **not** prove browser cookie-domain behavior and must not be reported as a Chromium UI pass just because the project is named chromium-desktop.

The browser driver TypeScript project is the narrow exception that includes Node, DOM (page.evaluate callbacks), and generated Worker declarations (binding handles). Production browser/Worker/Node projects remain separate. Generated consumer binding declarations also reference the root named entrypoint; declaration checking is skipped for generated/upstream libraries, not application files.

## Manual checks before acceptance

Review the generated desktop/mobile home screenshots in test-results, then inspect login, confirmation and account at 320px and desktop widths. Check focus visibility, Tab/Shift-Tab/Enter, back/refresh behavior, readable errors, no horizontal scrolling, no unexpected console errors, and no confirmation POST on mount/prefetch. Repeat core login on a physical phone before launch. Axe is supporting evidence, not a complete accessibility review. Never save real browser storage state or upload real captured emails/screenshots.

The implementation environment's actual results and blocked checks are in [verification.md](verification.md).
