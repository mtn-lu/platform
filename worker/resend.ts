interface ResendConfiguration {
  apiKey: string;
  from: string;
}

export interface ResendMessage {
  to: string;
  url: string;
  text: string;
  html: string;
}

export type Fetcher = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

async function idempotencyKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  return `mtn-login-${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export async function sendWithResend(
  configuration: ResendConfiguration,
  message: ResendMessage,
  fetcher: Fetcher = fetch,
): Promise<void> {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": await idempotencyKey(message.url),
      },
      body: JSON.stringify({
        from: configuration.from,
        to: [message.to],
        subject: "Your mtn.lu sign-in link",
        text: message.text,
        html: message.html,
      }),
    });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error("DELIVERY_UNAVAILABLE");
  } catch {
    throw new Error("DELIVERY_UNAVAILABLE");
  }
}
