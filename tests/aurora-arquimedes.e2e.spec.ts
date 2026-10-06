import { expect, test } from "@playwright/test";

test.describe("Aurora · Arquimedes · criação autônoma de atividade", () => {
  test("cria atividade pela conversa e confirma na aba Atividades", async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_E2E_MUTATE !== "1",
      "Teste mutável: defina PLAYWRIGHT_E2E_MUTATE=1 para executar contra a obra configurada."
    );
    const activityName = process.env.PLAYWRIGHT_ACTIVITY_NAME ?? `Teste Playwright Aurora ${Date.now()}`;
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("button", { name: "AURORA TESTE", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Arquimedes", exact: true }).first().click();
    const composer = page.getByRole("textbox", { name: "Pergunte sobre a obra…" });
    await expect(composer).toBeVisible();
    await composer.fill(`Arquimedes, crie uma atividade de teste chamada ${activityName} com duração de 1 dia e vincule-a ao pacote adequado da EAP. Execute a operação sem pedir uma segunda confirmação. Se o MCP não conseguir resolver a obra, use a fonte local da Plataforma Obras como fallback. Depois valide que a atividade foi realmente criada, com duração e vínculo corretos.`);
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByText(activityName, { exact: true })).toBeVisible({ timeout: 150_000 });
    await page.getByRole("button", { name: "ATIVIDADES", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: activityName });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText("1d");
    await expect(row).toContainText("1.1.2");
  });
});
