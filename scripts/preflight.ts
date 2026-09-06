import { readFileSync } from "node:fs";
import { parse, type ParseError } from "jsonc-parser";
import { z } from "zod";
export function validateProduction(
  raw: unknown,
  secrets: Record<string, string | undefined>,
): void {
  const schema = z.object({
    name: z.string().regex(/^[a-z0-9-]+$/),
    account_id: z.string().regex(/^[a-f0-9]{32}$/),
    workers_dev: z.literal(false),
    preview_urls: z.literal(false),
    compatibility_date: z.literal("2026-09-06"),
    vars: z.object({
      APP_ENV: z.literal("production"),
      CANONICAL_ORIGIN: z.literal("https://mtn.lu"),
      RETURN_ORIGINS: z.string(),
      EMAIL_MODE: z.literal("cloudflare"),
      EMAIL_FROM: z.email(),
    }),
    d1_databases: z
      .array(
        z.object({
          binding: z.literal("DB"),
          database_id: z.uuid(),
          database_name: z.string().min(1),
        }),
      )
      .length(1),
    send_email: z.array(z.object({ name: z.literal("EMAIL") })).length(1),
    routes: z
      .array(
        z.object({
          pattern: z.literal("mtn.lu"),
          custom_domain: z.literal(true),
        }),
      )
      .length(1),
  });
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error("Production configuration incomplete");
  const c = result.data;
  if (
    c.d1_databases.some(
      (d) => d.database_id === "00000000-0000-0000-0000-000000000000",
    ) ||
    JSON.stringify(c).includes("REPLACE") ||
    c.vars.RETURN_ORIGINS.split(",").some((s) => {
      try {
        const u = new URL(s);
        return (
          u.origin !== s ||
          u.protocol !== "https:" ||
          u.port !== "" ||
          u.username !== "" ||
          u.password !== "" ||
          u.hostname.endsWith(".invalid")
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error("Production configuration unsafe");
  for (const name of ["AUTH_SECRET", "THROTTLE_SECRET"])
    if ((secrets[name]?.length ?? 0) < 48)
      throw new Error("Required secrets missing");
  if (secrets.AUTH_SECRET === secrets.THROTTLE_SECRET)
    throw new Error("Secrets must be independent");
}
if (import.meta.main) {
  try {
    const errors: ParseError[] = [];
    const raw: unknown = parse(
      readFileSync("wrangler.production.jsonc", "utf8"),
      errors,
      { allowTrailingComma: true },
    );
    if (errors.length) throw new Error("Invalid configuration syntax");
    validateProduction(raw, process.env);
    console.log(
      "Local preflight passed. Remote binding/secret existence has NOT been checked.",
    );
  } catch {
    console.error(
      "Preflight rejected: provide a complete production config and required secrets through the local process environment. No deployment performed.",
    );
    process.exitCode = 1;
  }
}
