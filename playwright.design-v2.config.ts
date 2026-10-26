import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: /design-v2\.preview\.spec\.ts$/,
  timeout: 30000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5182",
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "test-results/design-v2", 
  webServer: {
    command: "pnpm exec vite --config vite.design-v2.config.ts",
    url: "http://127.0.0.1:5182/design-v2.html",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
