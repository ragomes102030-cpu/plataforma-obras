import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
  testDir:"./tests",
  testMatch:"control-tower-qa.e2e.spec.ts",
  timeout:60_000,
  workers:1,
  fullyParallel:false,
  reporter:"list",
  outputDir:"test-results/control-tower",
  use:{baseURL:"http://127.0.0.1:4178",trace:"retain-on-failure",screenshot:"only-on-failure",...devices["Desktop Chrome"]},
  webServer:{command:"pnpm exec vite --config vite.control-tower-qa.config.ts --host 127.0.0.1 --port 4178 --strictPort",url:"http://127.0.0.1:4178/control-tower-qa.html",reuseExistingServer:!process.env.CI,timeout:90_000}
});