import { spawnSync } from "node:child_process";
const mode = process.argv[2];
if (mode !== "setup" && mode !== "read")
  throw new Error("Use email setup or email read (local only)");
const command =
  mode === "setup"
    ? "CREATE TABLE IF NOT EXISTS dev_email(id INTEGER PRIMARY KEY,to_address TEXT NOT NULL,text TEXT NOT NULL,html TEXT NOT NULL,created_at INTEGER NOT NULL)"
    : "SELECT text FROM dev_email ORDER BY id DESC LIMIT 1";
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "DB",
    "--local",
    "--command",
    command,
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exitCode = 1;
