import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          AUTH_SECRET:
            "synthetic-test-auth-secret-000000000000000000000000000000",
          THROTTLE_SECRET:
            "synthetic-test-throttle-secret-0000000000000000000000000",
        },
      },
    }),
  ],
  test: { include: ["tests/worker/**/*.test.ts"] },
});
