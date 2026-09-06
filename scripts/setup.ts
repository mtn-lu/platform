import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
try {
  writeFileSync(
    ".dev.vars",
    `AUTH_SECRET=${randomBytes(48).toString("base64url")}\nTHROTTLE_SECRET=${randomBytes(48).toString("base64url")}\nRESEND_API_KEY=re_unused_local_${randomBytes(32).toString("base64url")}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log("Created local configuration. Run npm run db:migrate.");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST")
    console.log("Existing local configuration preserved.");
  else throw error;
}
