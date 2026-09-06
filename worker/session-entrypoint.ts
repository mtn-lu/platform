import { WorkerEntrypoint } from "cloudflare:workers";
import type { Identity } from "../shared/contracts.ts";
import { currentSession } from "./auth.ts";
export class SessionValidation extends WorkerEntrypoint<CloudflareEnv> {
  async validateSession(cookie: string): Promise<Identity | null> {
    if (typeof cookie !== "string") return null;
    const s = await currentSession(this.env, cookie);
    return s
      ? {
          version: 1,
          id: s.user.id,
          name: s.user.name,
          expiresAt: s.session.expiresAt.toISOString(),
        }
      : null;
  }
}
