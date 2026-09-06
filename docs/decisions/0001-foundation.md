# 0001 — Platform foundation

Verified 2026-09-06 against npm metadata, official documentation and installed source.

One Worker serves React static assets and Hono API routes. One D1 database owns identity, membership and bounded abuse counters. Better Auth owns verification tokens, sessions and cookies. Future apps remain separate deployments/databases: shared identity is not shared application authorization. No ORM or deployed auxiliary service is needed.

Exact direct versions are in package.json and resolved in package-lock.json. Node 24.19.0 / npm 11.9.0; Better Auth 1.7.3; React 19.2.8; Vite 8.2.2; Cloudflare Vite plugin 1.54.4; Wrangler 4.129.0; Hono 4.13.7; Zod 4.5.4; Wouter 3.11.0. Testing uses Vitest 4.1.11 and @cloudflare/vitest-plugin 1.1.4, Playwright 1.63.0 and axe 4.13.0.

Compatibility choices: latest Vitest 5 is outside the Cloudflare plugin peer range; TypeScript 7 is outside typescript-eslint 8.69.0's range, so use TypeScript 6.0.3. JSX accessibility lint's peer range requires ESLint 9.39.5 (upstream marks this line unsupported), not ESLint 10. Keep this tooling limitation visible until its peer support updates. All direct releases are stable. **Upstream discrepancy:** current stable Cloudflare tooling itself pins Miniflare 5.20260903.0-alpha transitively. We preserve the supported upstream graph rather than override internal runtime dependencies or conceal it with peer flags.

Compatibility date 2026-09-06 enables Node compatibility by default (since 2026-08-04); no redundant compatibility flags. Runtime and binding types come from Wrangler; strict-vars=false allows testing validated alternative configurations. skipLibCheck is limited to upstream/generated declaration checking; application code retains all strict checks. Browser, Worker and Node projects have separate globals. ESLint forbids server imports from browser/shared contracts.

Better Auth 1.7.3's magicLinkVerify calls consumeVerificationValue; native D1 disables interactive transactions and the adapter consumes with DELETE ... RETURNING. Runtime tests must additionally establish concurrency behavior. Fixed sessions use disableSessionRefresh and no cookie cache. Session credentials are library-issued random tokens stored in the database, with signed browser cookies; hashing magic-link tokens does not hash session tokens.

Official references:

- [React/Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/), [compatibility defaults](https://developers.cloudflare.com/workers/configuration/compatibility-flags/), [generated types](https://developers.cloudflare.com/workers/languages/typescript/), [asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
- [Vitest configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/), [file isolation](https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/).
- [Better Auth database](https://better-auth.com/docs/concepts/database), [magic links](https://better-auth.com/docs/plugins/magic-link), [cookies](https://better-auth.com/docs/concepts/cookies), [sessions](https://better-auth.com/docs/concepts/session-management), [security](https://better-auth.com/docs/reference/security). The 1.5 announcement is historical; installed 1.7.3 source controls implementation details.
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Worker RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/).
- [Node releases](https://nodejs.org/en/about/previous-releases), [TypeScript](https://www.typescriptlang.org/tsconfig/), [typed linting](https://typescript-eslint.io/getting-started/typed-linting/), [Hono](https://hono.dev/docs/getting-started/cloudflare-workers).

Wrangler emits some trailing whitespace in its generated runtime declarations. Git whitespace checks and review collapsing are scoped to those generated files through .gitattributes; their content is preserved verbatim for drift checks. The optional Vite inspector is disabled because interface enumeration is unavailable in the implementation runtime. Verification cleanup is explicitly delegated to the bounded scheduled handler, disabling Better Auth’s opportunistic verification cleanup.
