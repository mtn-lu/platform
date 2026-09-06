import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sqlString } from "./sql.ts";
const args = process.argv.slice(2);
const action = z.enum(["grant", "revoke"]).parse(args[0]);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email())
  .parse(args[1]);
const remote = args.includes("--remote");
if (args.slice(2).some((a) => a !== "--remote"))
  throw new Error("Unknown option");
if (remote) {
  const result = spawnSync(process.execPath, ["scripts/preflight.ts"], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(1);
}
mkdirSync(".local", { recursive: true });
const file = `.local/access-${randomUUID()}.sql`;
writeFileSync(
  file,
  `INSERT INTO platform_access(email,enabled,created_at,updated_at) VALUES(${sqlString(email)},${action === "grant" ? "1" : "0"},unixepoch(),unixepoch()) ON CONFLICT(email) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at;`,
  { mode: 0o600 },
);
try {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      remote ? "--remote" : "--local",
      "--config",
      remote ? "wrangler.production.jsonc" : "wrangler.jsonc",
      "--file",
      file,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exitCode = 1;
} finally {
  rmSync(file);
}
