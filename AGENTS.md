# Working on platform

Read docs/security.md before changing authentication, cookies, redirects, logging or app bindings. Preserve the one Worker / one identity D1 boundary. Better Auth owns token/session/cookie mechanics. Never mount its broad handler or publicly expose its GET verifier. All membership decisions remain server-side and revocation applies to HTTP and RPC.

Use Node 24 and npm ci. Direct dependency versions are exact; do not use prereleases, force peer resolution, or silently override Cloudflare's internal dependency graph. Record compatibility discrepancies in docs/decisions/0001-foundation.md. Generate binding types rather than hand-editing them. Keep browser/shared imports free of server implementations and secrets.

Use feature branches; no force pushes. Run format:check, typecheck, lint, test, test:node and build. Auth/UI changes additionally require test:browser. State any unavailable check clearly. Worker tests have per-file storage isolation and explicitly clear tables between test cases. Never use real identities, production cookies, real email delivery or a saved real browser session in tests.

Ordinary work is local. Do not deploy, apply remote migrations, create remote resources, change DNS/settings or send real email without explicit owner authorization. CI never deploys. Production examples remain inactive until deliberately configured. Never commit .dev.vars, .local, .wrangler, TLS keys or dist. Do not select a project license for the owner.
