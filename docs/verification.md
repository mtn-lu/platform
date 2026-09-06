# Verification — 2026-09-06

Implementation is reviewable. [GitHub CI](https://github.com/mtn-lu/platform/actions/runs/34053027269) passed the full workflow, including all six Playwright cases in Chromium desktop and WebKit at a 320px phone viewport. No deployment, remote migration, remote secret change, account setting change, or real email send was performed.

## Executed checks

- Repository/default-branch inspection: public mtn-lu/platform, main, initial README commit. Implementation uses scaffold/platform-foundation; one commit per phase.
- `npm install` resolved exact direct versions and package-lock.json without force/legacy-peer flags. `npm audit` and `npm audit --omit=dev` reported zero advisories at verification time.
- `npm run setup`: creates random local secrets, preserves existing configuration.
- `npm run db:migrate` twice: local D1 migrations applied successfully; repeated application reports no migrations. `npm run access -- grant friend@example.test` and revoke worked locally. `npm run email -- setup` created the capture table.
- `npm run types`, `npm run types:consumer`, generated-file `git diff --exit-code`: pass, no binding/runtime declaration drift.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: pass after fixes.
- `npm test`: 15 tests across two isolated workerd files pass, using actual D1 and Better Auth. Includes concurrent single-use redemption, replay/expiry, membership/revocation, JSON/body-size/origin/redirect/route boundaries, atomic quotas, cookie configuration, logout/all-session logout, read-only named RPC, schema drift, provider/capture failure and bounded cleanup.
- `npm run test:node`: three tests pass for SQL literal serialization, remote operator preflight blocking and deployment configuration rejection.
- `npm run build`: frontend and Worker builds pass. Final aggregate sizes (sum of JS/CSS files; gzip level 6 measured per file): frontend 284,659 bytes raw / 86,648 gzip; Worker including 12 entry/chunk files 752,058 bytes raw / 201,971 gzip. No claim about production CPU or actual network transfer is implied.
- `npm run test:tls`; `npm run test:browser -- --project=chromium-desktop --grep 'built Worker'`: one built-artifact smoke test passes without launching a browser. It exercises the real consumer service binding, revocation, static CSP, API navigation and absence of tested credentials in captured runtime logs. This is **not** a Chromium browser pass.
- `npm run dev`: Vite starts after disabling optional inspector port discovery, which otherwise failed on this environment's restricted network-interface enumeration.

## Browser evidence and remaining limits

`npm run test:browser` was attempted. Browser cases did not run: Chromium/Chrome Headless Shell downloads repeatedly returned gateway errors/timeouts. WebKit downloaded through the official fallback host but its required host libraries are missing. `npx playwright install-deps chromium webkit` failed because the environment cannot perform the package installer's required user/group operations. A separate cloud-browser attempt to access the local application returned ERR_BLOCKED_BY_CLIENT.

The GitHub runner subsequently installed both browsers and passed all six cases: real UI login/confirmation, HTTPS domain-cookie recognition by the consumer, logout/revocation denial, expired-link recovery, axe checks, keyboard focus assertion, overflow and API navigation. The harness uses controlled `mtn.test` / `games.mtn.test` hostnames, generated TLS and separate ephemeral D1. CI retains only synthetic screenshots for seven days; the PR records the final visual review. Physical-device testing and a complete manual keyboard audit remain unperformed. A phone viewport does not establish physical-device behavior.

Real Cloudflare email deliverability, account/beta availability, production DNS, actual production CPU/latency/cost, backup restoration against a remote account and deployed cookie behavior were not tested. Those require owner-controlled deployment setup. The scaffold does not claim to be independently security-audited.

## Phase checkpoints

A: npm metadata/official API verification; types, typecheck, lint, build. B: generated SQL; local migrations twice; grant/revoke. C: library-backed facade and first two D1 auth tests. D: HTTP/capture/security controls; nine D1 endpoint tests; unsafe preflight rejected. E: responsive routes, generated consumer binding and typed/linted app integration. F: 15 workerd tests, three Node tests, built service-binding smoke; browser attempts blocked as above. G: CI, runbooks, clean-checkout workflow and final diff review.

## Clean-checkout result

A separate detached worktree installed from the committed lockfile and passed this workflow:

```sh
npm ci
npm run setup
npm run setup
npm run types
npm run types:consumer
git diff --exit-code
npm run format:check
npm run typecheck
npm run lint
npm run db:migrate
npm run db:migrate
npm run email -- setup
npm run access -- grant friend@example.test
npm run access -- revoke friend@example.test
npm test
npm run test:node
npm audit
npm run build
npm run test:tls
npm run test:browser -- --project=chromium-desktop --grep 'built Worker'
```

A Node child-process check started the clean-checkout Vite dev server and fetched `/api/health` (200 application/json), `/api/missing` (404 application/json), and `/account` (200 text/html), then stopped the server. Final log-correlation/credential assertions were subsequently rechecked with typecheck, lint, all 15 workerd tests, build and the service-binding smoke test. Source diff/ignored artifact review found no committed secrets, local state, private keys or real identities. A scan of frontend build files found zero matches for the generated local secrets. SHA pins for checkout/setup-node/upload-artifact v6 were verified against those official repositories' tag refs. Git whitespace exceptions apply only to verbatim Wrangler-generated declarations.

Post-phase QA: retained synthetic home/confirmation/account screenshots, updated CI browser evidence, and reran formatting, typecheck and lint before publishing the follow-up commit.
