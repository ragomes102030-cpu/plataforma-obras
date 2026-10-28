import { expect, test } from "@playwright/test";

test("services sequenciais compartilham faixa e mantêm a Linha de Balanço compacta", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", error => erros.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") erros.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lob-qa.html");
  await expect(page.getByRole("rowheader", { name: "Área externa" })).toBeVisible();
  await expect(page.getByTestId("lob-step-bar")).toHaveCount(8);

  const alturaDaLinha = await page.getByRole("rowheader", { name: "Área externa" })
    .locator("xpath=..").evaluate(element => element.getBoundingClientRect().height);
  expect(alturaDaLinha).toBe(64);

  const faixasVerticais = await page.getByTestId("lob-step-bar").evaluateAll(barras =>
    barras.map(barra => Number.parseFloat((barra as HTMLElement).style.top))
  );
  expect(faixasVerticais).toEqual(Array(8).fill(10));
  await page.screenshot({ path: "test-results/lob-profissional/desktop-faixas-compactas.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/lob-profissional/mobile-faixas-compactas.png", fullPage: true });
  expect(erros).toEqual([]);
});
