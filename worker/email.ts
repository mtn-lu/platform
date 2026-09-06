import { config } from "./config.ts";
export interface LoginEmail {
  to: string;
  url: string;
}
export interface EmailTransport {
  send(message: LoginEmail): Promise<void>;
}
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
export function emailTransport(env: CloudflareEnv): EmailTransport {
  const c = config(env);
  return {
    async send({ to, url }) {
      const text = `Sign in to mtn.lu\n\nOpen this link and choose Continue to sign in: ${url}\n\nExpires in 15 minutes. If you did not request this email, ignore it. Do not forward this link.`;
      const html = `<h1>Sign in to mtn.lu</h1><p><a href="${escapeHtml(url)}">Review your sign-in request</a></p><p>Choose Continue on the next screen to sign in. Expires in 15 minutes.</p><p>If you did not request this email, ignore it. Do not forward this link.</p>`;
      if (c.EMAIL_MODE === "capture") {
        // Table exists only after the local-only email setup command, never in migrations.
        await env.DB.prepare(
          "INSERT INTO dev_email(to_address,text,html,created_at) VALUES(?,?,?,?)",
        )
          .bind(to, text, html, Date.now())
          .run();
      } else {
        if (!env.EMAIL) throw new Error("DELIVERY_UNAVAILABLE");
        await env.EMAIL.send({
          to,
          from: c.EMAIL_FROM,
          subject: "Your mtn.lu sign-in link",
          text,
          html,
        });
      }
    },
  };
}
