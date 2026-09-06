import { z } from "zod";
const schema = z.object({
  APP_ENV: z.enum(["local", "test", "production"]),
  CANONICAL_ORIGIN: z.url(),
  RETURN_ORIGINS: z.string(),
  EMAIL_MODE: z.enum(["capture", "resend"]),
  EMAIL_FROM: z.string(),
  RESEND_API_KEY: z.string().min(20).startsWith("re_").optional(),
  AUTH_SECRET: z.string().min(48),
  THROTTLE_SECRET: z.string().min(48),
  LINK_ADDRESS_LIMIT: z.coerce.number().int().min(1).max(100),
  LINK_IP_LIMIT: z.coerce.number().int().min(1).max(1000),
  DAILY_EMAIL_LIMIT: z.coerce.number().int().min(1).max(10000),
  CONFIRM_IP_LIMIT: z.coerce.number().int().min(1).max(1000),
});
export function config(env: CloudflareEnv) {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error("CONFIG_INVALID");
  const c = result.data;
  const origin = new URL(c.CANONICAL_ORIGIN);
  if (
    origin.origin !== c.CANONICAL_ORIGIN ||
    origin.username ||
    origin.password
  )
    throw new Error("CONFIG_INVALID");
  const returnOrigins = c.RETURN_ORIGINS.split(",");
  if (
    returnOrigins.some((s) => {
      try {
        return new URL(s).origin !== s;
      } catch {
        return true;
      }
    })
  )
    throw new Error("CONFIG_INVALID");
  if (c.APP_ENV === "production") {
    if (
      c.CANONICAL_ORIGIN !== "https://mtn.lu" ||
      c.EMAIL_MODE !== "resend" ||
      !z.email().safeParse(c.EMAIL_FROM).success ||
      !c.RESEND_API_KEY ||
      returnOrigins.some(
        (s) => !s.startsWith("https://") || s.includes(".invalid"),
      ) ||
      c.AUTH_SECRET === c.THROTTLE_SECRET
    )
      throw new Error("CONFIG_INVALID");
  } else {
    if (
      !["127.0.0.1", "localhost", "mtn.test"].includes(origin.hostname) ||
      c.EMAIL_MODE !== "capture"
    )
      throw new Error("CONFIG_INVALID");
    if (
      origin.hostname === "mtn.test" &&
      (c.APP_ENV !== "test" || origin.protocol !== "https:")
    )
      throw new Error("CONFIG_INVALID");
  }
  return {
    ...c,
    returnOrigins,
    cookieDomain:
      c.APP_ENV === "production"
        ? "mtn.lu"
        : origin.hostname === "mtn.test"
          ? "mtn.test"
          : undefined,
    secure: origin.protocol === "https:",
  };
}
