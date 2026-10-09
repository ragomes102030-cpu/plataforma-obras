import { defineConfig, devices } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: "./tests",
  // O escape duplo (\\.) casaria um backslash literal, não um ponto — por isso
  // este arquivo nunca aparecia em `playwright test --list` e parecia que o
  // Playwright estava quebrado.
  testMatch: /\.e2e\.spec\.ts$/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  outputDir: "test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://plataforma-obras-api.onrender.com",
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || path.join(__dirname, 'playwright-storage-state.json'),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
