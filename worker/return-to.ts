export function returnDestination(
  raw: string | undefined,
  origin: string,
  approved: readonly string[],
): string {
  const value = raw ?? "/account";
  // Conservative: no encoded redirect syntax, credentials, fragments or controls.
  if (
    value.length > 1024 ||
    Array.from(value, (c) => c.codePointAt(0) ?? 0).some(
      (n) => n <= 32 || n === 127,
    ) ||
    /[\\%#]/u.test(value) ||
    value.startsWith("//")
  )
    throw new Error("INVALID_RETURN");
  const url = new URL(value, origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !approved.includes(url.origin)
  )
    throw new Error("INVALID_RETURN");
  return url.href;
}
