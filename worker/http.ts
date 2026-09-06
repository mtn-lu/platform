import { z } from "zod";
export class HttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 405 | 413 | 415 | 429 | 503,
  ) {
    super(code);
  }
}
export function csrf(request: Request, origin: string): void {
  if (request.headers.get("origin") !== origin)
    throw new HttpError("UNTRUSTED_ORIGIN", 403);
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin")
    throw new HttpError("UNTRUSTED_ORIGIN", 403);
  const mode = request.headers.get("sec-fetch-mode");
  if (mode === "navigate" || mode === "no-cors")
    throw new HttpError("UNTRUSTED_ORIGIN", 403);
}
export async function jsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    throw new HttpError("JSON_REQUIRED", 415);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 2048))
    throw new HttpError("BODY_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("INVALID_BODY", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk: unknown = next.value;
      if (!(chunk instanceof Uint8Array))
        throw new HttpError("INVALID_BODY", 400);
      size += chunk.byteLength;
      if (size > 2048) {
        await reader.cancel();
        throw new HttpError("BODY_TOO_LARGE", 413);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    throw new HttpError("INVALID_JSON", 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError("INVALID_BODY", 400);
  return parsed.data;
}
export function copyCookies(from: Headers, to: Headers): void {
  for (const cookie of from.getSetCookie()) to.append("Set-Cookie", cookie);
}
