import { Hono } from "hono";
const app = new Hono<{ Bindings: CloudflareEnv }>();
app.get("/api/health", (c) => c.json({ status: "ok" }));
app.all("/api/health", (c) => {
  c.header("Allow", "GET, HEAD");
  return c.json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
});
app.notFound((c) => c.json({ error: { code: "NOT_FOUND" } }, 404));
app.onError((_error, c) => c.json({ error: { code: "UNAVAILABLE" } }, 503));
export default app;
