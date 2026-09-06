import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({
  plugins: [
    cloudflare({
      inspectorPort: false,
      configPath: process.env.PLATFORM_CONFIG ?? "wrangler.jsonc",
    }),
  ],
  server: { port: 5173, strictPort: true },
  build: { minify: true },
});
