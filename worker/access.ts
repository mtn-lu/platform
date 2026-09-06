import { emailSchema } from "../shared/contracts.ts";
export async function hasAccess(
  db: D1Database,
  email: string,
): Promise<boolean> {
  const normalized = emailSchema.safeParse(email);
  if (!normalized.success) return false;
  return (
    (await db
      .prepare(
        "SELECT 1 AS allowed FROM platform_access WHERE email=? AND enabled=1",
      )
      .bind(normalized.data)
      .first()) !== null
  );
}
