# Add an independently deployed app

The test-only consumer in tests/fixtures/consumer demonstrates the binding. Do not deploy it as the games app. A future app has its own repository, Worker and D1 database. Bind AUTH to the deployed platform Worker, entrypoint SessionValidation; do not bind the identity database or distribute the auth secret.

```json
{
  "services": [
    {
      "binding": "AUTH",
      "service": "YOUR-PLATFORM-WORKER",
      "entrypoint": "SessionValidation"
    }
  ]
}
```

The browser sends its shared cookie to games.mtn.lu. The app passes the Cookie header internally to `AUTH.validateSession(cookie)`. The named RPC entrypoint returns null or `{version:1,id,name,expiresAt}`. It exposes no HTTP route, email, session token, or database row. Never trust a browser-supplied X-User-Id. Validate the response version at an untyped boundary.

A null result means redirect the browser to `https://mtn.lu/login?returnTo=...` using an app-owned constant return URL (encode the outer query parameter normally). Register the exact games origin in the platform's RETURN_ORIGINS first. The platform separately enforces its own exact mutation origin. The server revalidates the final return destination; tokens never enter that destination. Fixed sessions expire after 30 days and RPC never refreshes a browser cookie.

Authentication does not authorize access to a game night, trip, or another user's records. Each app must independently check its membership and resource ownership against the stable platform user ID. Separate D1 databases cannot have cross-database foreign keys. Keep user references as opaque IDs and define deletion/retention policy per app.

Read [the shared-subdomain trust model](security.md) before adding any host. The binding is Cloudflare Workers RPC, not a portable language-neutral HTTP protocol. A future Go service on another host needs a deliberately authenticated HTTP integration or standards-based SSO. Neither is implemented here.
