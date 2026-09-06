export async function digestKey(
  secret: string,
  value: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function quota(
  db: D1Database,
  secret: string,
  scope: string,
  value: string,
  limit: number,
  seconds: number,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / seconds);
  const key = await digestKey(secret, `${scope}:${value}:${String(bucket)}`);
  const row = await db
    .prepare(
      "INSERT INTO throttle(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count",
    )
    .bind(key, (bucket + 1) * seconds, limit)
    .first();
  return row !== null;
}
