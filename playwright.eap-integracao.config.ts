import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
  testDir:"./tests",testMatch:"eap-studio-integration.e2e.spec.ts",timeout:60000,workers:1,reporter:"list",outputDir:"test-results/eap-studio-integracao",
  use:{baseURL:"http://127.0.0.1:4180",trace:"retain-on-failure",screenshot:"only-on-failure",...devices["Desktop Chrome"]},
  webServer:{command:"pnpm exec vite --config vite.eap-studio-integracao.config.ts --host 127.0.0.1 --port 4180 --strictPort",
  url:"http://127.0.0.1:4180/eap-studio-integracao.html",reuseExistingServer:!process.env.CI,timeout:90000},
});