import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: { ignoreHTTPSErrors: true, trace: "off", screenshot: "only-on-failure" },
  projects: [
    {
      name: "chromium-desktop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "webkit-phone",
      use: { browserName: "webkit", viewport: { width: 320, height: 740 } },
    },
  ],
});
