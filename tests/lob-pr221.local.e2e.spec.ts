import { expect, test } from "@playwright/test";

test("edita locais e desenha a escadinha com o fluxo atual", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", error => erros.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lob-qa.html");
  await expect(page.getByRole("heading", { name: "Linha de Balanço" })).toBeVisible();

  await page.getByRole("button", { name: "Editar atividades" }).click();
  await page.getByLabel("Local QA.01").fill("P01");
  await page.getByLabel("Local QA.02").fill("P02");
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(page.getByRole("rowheader", { name: "P01" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "P02" })).toBeVisible();
  await expect(page.locator('[data-testid="lob-step-bar"]')).toHaveCount(2);
  await expect(page.locator(".lob-stairs-legend")).toContainText("Alvenaria");
  await page.screenshot({ path: "test-results/lob-profissional/desktop-lob-atual.png", fullPage: true });
  expect(erros).toEqual([]);
});

test("LOB filtrada permanece compacta e legível no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lob-qa.html?height=1");
  await page.getByLabel("Início do período da Linha de Balanço").fill("2026-11-01");
  await page.getByLabel("Fim do período da Linha de Balanço").fill("2026-11-30");

  const linhaP01 = page.locator(".lob-stairs-row").filter({ hasText: "P01" }).first();
  await expect(linhaP01).toHaveCSS("height", "64px");
  await expect(linhaP01.locator(".lob-stairs-bar")).toHaveCount(1);
  await expect(page.getByTestId("lob-total-timeline")).toContainText("2 atividades no gráfico · 2 com local físico");
  await expect(page.locator(".lob-stairs-legend")).not.toContainText("Impermeabilização");
  await expect(page.locator(".lob-stairs-analysis > summary")).toContainText("1 ritmos · 0 janelas simultâneas");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/lob-profissional/mobile-lob-compacta-periodo.png", fullPage: true });
});
