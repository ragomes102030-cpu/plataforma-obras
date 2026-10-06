import { test, expect } from "@playwright/test";
import fs from "node:fs";

const authState = process.env.PLAYWRIGHT_STORAGE_STATE ?? ".playwright/auth.json";
const hasAuthState = fs.existsSync(authState);

test.describe("Arquimedes production smoke", () => {
  test("landing page is reachable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText(/Criar nova obra|Arquimedes/i);
  });

  test("authenticated Aurora planning flow", async ({ page }) => {
    test.skip(!hasAuthState, "Requires PLAYWRIGHT_STORAGE_STATE or .playwright/auth.json");

    await page.goto("/");
    await expect(page.locator("body")).toContainText("Obra");

    const aurora = page.getByText("AURORA TESTE", { exact: false }).first();
    await expect(aurora).toBeVisible();
    await aurora.click();

    await expect(page.locator("body")).toContainText(/Visão Geral|EAP|Atividades/);

    // Dashboard: the engineer should immediately understand the planning state.
    await expect(page.locator("body")).toContainText("Pacotes EAP");
    await expect(page.locator("body")).toContainText("Atividades");
    await expect(page.locator("body")).toContainText("Dependências");
    await expect(page.locator("body")).toContainText("Baseline");

    // EAP: regression contract for the approved Aurora fixture.
    const eapTab = page.getByText("EAP", { exact: true }).first();
    await eapTab.click();
    await expect(page.locator("body")).toContainText("69");
    await expect(page.locator("body")).toContainText("53");
    await expect(page.locator("body")).toContainText(/EAP já aprovada|Baseline EAP|Aprovada/i);

    // Activities: Aurora is intentionally ready for this next stage but has no activities yet.
    const activitiesTab = page.getByText("Atividades", { exact: true }).first();
    await activitiesTab.click();
    await expect(page.locator("body")).toContainText(/ATIVIDADES|atividade/i);
    await expect(page.locator("body")).toContainText(/próxima etapa|proposta|sem atividades/i);

    // CPM must not present "Calculado" as if a network exists with zero activities.
    const cpmTab = page.getByText("CPM", { exact: true }).first();
    await cpmTab.click();
    await expect(page.locator("body")).toContainText(/Sem rede|sem atividades|não há atividades/i);

    // Read-only smoke test: no create/edit/delete action is invoked.
  });
});
