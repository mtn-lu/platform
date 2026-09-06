# mtn.lu platform

A small landing page and invite-only shared identity for independently deployed apps. React static assets and a Hono/Better Auth API run in **one Cloudflare Worker**, backed by one identity D1 database. No Cloudflare account, paid plan, or real email is needed locally.

Production authentication mail uses Resend through a small direct HTTP adapter; local development remains capture-only. See the operations runbook for the verified-domain, secret and DNS cutover steps.

**Shared cookie warning:** every backend under mtn.lu is inside the same credential trust boundary. Do not put untrusted content or preview code under that namespace. See [security](docs/security.md).

## Run locally

Use Node **24.19.0** and npm **11.9.0** (Node 24/npm 11 supported).

```sh
npm ci
npm run setup
npm run db:migrate
npm run email -- setup
npm run access -- grant friend@example.test
npm run dev
```

Open http://127.0.0.1:5173, choose Sign in and enter `friend@example.test`. Retrieve the most recent captured email locally:

```sh
npm run email -- read
```

Open its link and choose **Continue**. The email is captured in ignored local D1 state, not sent. No inbox HTTP endpoint exists. Setup creates independent random local secrets only if the file is missing; it never overwrites your configuration. New checkouts start with an empty allowlist. Grant/revoke retain user IDs; ordinary commands are local only.

```sh
npm run access -- revoke friend@example.test
```

## Check and build

```sh
npm run types
npm run types:consumer
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:node
npm run build
```

`npm run format` formats files. `npm run preview` serves the built application locally on port 5173; stop dev first. Neither build nor preview deploys. Type generation expects `npm run setup` first so secret names are known, but generated files never contain secret values.

For real Chromium/WebKit HTTPS tests, including shared cookies, follow [browser prerequisites](docs/testing.md). [Verification results](docs/verification.md) record passing runtime and CI browser checks, local browser-environment limitations, and remaining manual checks.

## Boundaries and operations

- [Dependency decisions and source verification](docs/decisions/0001-foundation.md)
- [Security model](docs/security.md)
- [Local/production operations and deployment runbook](docs/operations.md)
- [Integrate another app](docs/adding-an-app.md)
- [Test harness and manual review](docs/testing.md)

API: GET `/api/health`, POST `/api/auth/request-link`, POST `/api/auth/confirm`, GET `/api/me`, POST `/api/auth/logout`, POST `/api/auth/logout-all`. Authentication errors are structured JSON. Unauthenticated `/api/me` returns 401 with `{user:null}`. Unsupported auth routes return 404; wrong methods return 405. No password login, open signup handler, SDK, real games app, public deployment, or project license is included.
