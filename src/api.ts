import { z } from "zod";
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(
      status === 429
        ? "Too many attempts. Please wait 15 minutes and try again."
        : status === 401
          ? "Please sign in to continue."
          : status === 400
            ? "This link is invalid, expired, or already used. Request a new one."
            : "We could not connect. Please try again.",
    );
  }
}
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) throw new ApiError(response.status);
  const data: unknown = await response.json();
  return schema.parse(data);
}
export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Service unavailable. Please try again.";
}
