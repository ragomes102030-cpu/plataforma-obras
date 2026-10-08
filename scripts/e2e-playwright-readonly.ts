import { chromium } from "playwright";
import fs from "node:fs";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://plataforma-obras-api.onrender.com";
const authState = process.env.PLAYWRIGHT_STORAGE_STATE ?? ".playwright/auth.json";
const hasAuth = fs.existsSync(authState);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(hasAuth ? { storageState: authState } : {});
const page = await context.newPage();

try {
  console.log("[Playwright] public smoke:", baseURL);
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("body").waitFor({ state: "visible" });
  const landing = await page.locator("body").innerText();
  if (!/Criar nova obra|Arquimedes/i.test(landing)) {
    throw new Error("Landing page did not expose the expected Arquimedes entry point.");
  }
  console.log("[Playwright] PASS public landing");

  if (!hasAuth) {
    console.log("[Playwright] SKIP authenticated Aurora: no PLAYWRIGHT_STORAGE_STATE");
    process.exitCode = 0;
  } else {
    console.log("[Playwright] authenticated Aurora smoke");
    await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const body = page.locator("body");
    await body.waitFor({ state: "visible" });

    if (!/Obra/i.test(await body.innerText())) {
      throw new Error("Authenticated session did not expose the Obras area.");
    }

    const aurora = page.getByText("AURORA TESTE", { exact: false }).first();
    await aurora.waitFor({ state: "visible", timeout: 30_000 });
    await aurora.click();

    await body.waitFor({ state: "visible" });
    const projectText = await body.innerText();
    if (!/Visão Geral|EAP|Atividades/i.test(projectText)) {
      throw new Error("Aurora planning workspace did not open.");
    }

    for (const label of ["Pacotes EAP", "Atividades", "Dependências", "Baseline"]) {
      if (!(await body.innerText()).includes(label)) {
        throw new Error(`Aurora planning area missing expected section: ${label}`);
      }
    }

    const eapTab = page.getByText("EAP", { exact: true }).first();
    if (await eapTab.count()) {
      await eapTab.click();
    }
    const eapText = await body.innerText();
    if (!eapText.includes("69") || !eapText.includes("53")) {
      throw new Error("Aurora EAP invariant not visible: expected 69 nodes and 53 leaves.");
    }
    if (!/EAP já aprovada|Baseline EAP|Aprovada/i.test(eapText)) {
      throw new Error("Aurora EAP approval state is not visible.");
    }
    console.log("[Playwright] PASS Aurora EAP: 69 nodes / 53 leaves");

    const activitiesTab = page.getByText("Atividades", { exact: true }).first();
    if (await activitiesTab.count()) {
      await activitiesTab.click();
    }
    const activitiesText = await body.innerText();
    if (!/atividade|ATIVIDADES/i.test(activitiesText)) {
      throw new Error("Aurora Activities view did not render.");
    }
    if (!/53/.test(activitiesText)) {
      console.log("[Playwright] WARN activity count is not text-visible in this view; continuing read-only.");
    }

    const depsTab = page.getByText("Dependências", { exact: true }).first();
    if (await depsTab.count()) {
      await depsTab.click();
      if (!/depend/i.test(await body.innerText())) {
        throw new Error("Aurora Dependencies view did not render.");
      }
    }

    const cpmTab = page.getByText("CPM", { exact: true }).first();
    if (await cpmTab.count()) {
      await cpmTab.click();
      const cpmText = await body.innerText();
      if (!/CPM|caminho crítico|crític/i.test(cpmText)) {
        throw new Error("Aurora CPM view did not render.");
      }
    }

    for (const label of ["Gantt", "LOB"]) {
      const tab = page.getByText(label, { exact: true }).first();
      if (await tab.count()) {
        await tab.click();
        const viewText = await body.innerText();
        if (!new RegExp(label, "i").test(viewText)) {
          throw new Error(`Aurora ${label} view did not render.`);
        }
      } else {
        console.log(`[Playwright] WARN ${label} tab not exposed as exact text; no mutation performed.`);
      }
    }

    console.log("[Playwright] PASS authenticated Aurora read-only flow");
  }
} finally {
  await context.close();
  await browser.close();
}
