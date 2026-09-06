import { config } from "./config.ts";
export async function cleanup(env: CloudflareEnv): Promise<void> {
  const c = config(env);
  const now = new Date();
  const queries = [
    env.DB.prepare(
      "DELETE FROM verification WHERE id IN (SELECT id FROM verification WHERE expiresAt<? LIMIT 500)",
    ).bind(now.toISOString()),
    env.DB.prepare(
      "DELETE FROM session WHERE id IN (SELECT id FROM session WHERE expiresAt<? LIMIT 500)",
    ).bind(now.toISOString()),
    env.DB.prepare(
      "DELETE FROM throttle WHERE key IN (SELECT key FROM throttle WHERE expires_at<? LIMIT 500)",
    ).bind(Math.floor(now.getTime() / 1000)),
  ];
  if (c.EMAIL_MODE === "capture")
    queries.push(
      env.DB.prepare(
        "DELETE FROM dev_email WHERE id IN (SELECT id FROM dev_email WHERE created_at<? LIMIT 500)",
      ).bind(now.getTime() - 900000),
    );
  await env.DB.batch(queries);
}
