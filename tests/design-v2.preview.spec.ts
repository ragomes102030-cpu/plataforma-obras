import { expect, test } from "@playwright/test";

test("dashboard, fluxo EAP, cronograma e painel de atividade", async ({ page }) => {
  await page.goto("/design-v2.html");
  await expect(page.getByRole("heading", { name: "Residencial Horizonte" })).toBeVisible();
  await expect(page.getByText("Prévia V2 · dados fictícios")).toBeVisible();
  await page.screenshot({ path: "test-results/design-v2/dashboard.png", fullPage: true });

  await page.getByRole("button", { name: /Continuar planejamento/ }).click();
  await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
  await expect(page.getByText("Baseline bloqueada nesta versão")).toBeVisible();
  await expect(page.getByRole("tab", { name: "EAP", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Cronograma" }).click();
  await expect(page.getByText("Baseline bloqueada nesta versão")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cronograma de atividades" })).toBeVisible();
  await page.screenshot({ path: "test-results/design-v2/gantt.png", fullPage: true });

  await page.getByRole("button", { name: /Escavações/ }).click();
  const drawer = page.getByRole("dialog", { name: "Detalhe da atividade" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("textbox", { name: "Nome da atividade" }).fill("Escavações — teste da prévia");
  await drawer.getByRole("button", { name: "Salvar na prévia" }).click();
  await expect(page.getByText("Escavações — teste da prévia")).toBeVisible();
  await expect(page.getByText("Alteração demonstrativa salva nesta sessão.", { exact: false })).toBeVisible();

  await page.getByRole("tab", { name: "Versões e baseline" }).click();
  await page.getByRole("button", { name: /Versão V2/ }).click();
  await expect(page.getByText("Versão de referência aprovada")).toBeVisible();
});

test("modo escuro e navegação responsiva no tablet", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/design-v2.html");
  await page.getByRole("button", { name: "Usar tema escuro" }).click();
  await expect(page.locator(".pv2")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Planejamento" }).click();
  await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
  await page.screenshot({ path: "test-results/design-v2/tablet.png", fullPage: true });

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Sair da obra" }).click();
  await expect(page.getByRole("heading", { name: "Obras" })).toBeVisible();
  await page.getByRole("button", { name: /Residencial Horizonte/ }).click();
  await expect(page.getByRole("heading", { name: "Residencial Horizonte" })).toBeVisible();
});
