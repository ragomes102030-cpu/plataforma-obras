import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "lob-pr221.local.e2e.spec.ts",
  timeout: 60_000,
  workers: 1,
  outputDir: "test-results/lob-pr221",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4174", trace: "on", screenshot: "only-on-failure" },
  webServer: { command: "pnpm exec vite --host 127.0.0.1 --port 4174 --strictPort", url: "http://127.0.0.1:4174/lob-qa.html", reuseExistingServer: !process.env.CI },
});
