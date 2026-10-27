import { expect, test } from "@playwright/test";

test("diagnóstico, mapa auxiliar, Gantt e série repetitiva P01/P02", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", error => erros.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") erros.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lob-qa.html");
  await expect(page.getByText("LINHA DE RITMO AINDA NÃO DISPONÍVEL")).toBeVisible();
  await expect(page.locator(".lob-pro-mapa-grade")).toBeVisible();
  await expect(page.getByText("ocupação não representa produtividade")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "P03" })).toBeVisible();
  await expect(page.locator(".lob-pro-scroll")).toHaveCount(0);
  await page.screenshot({ path: "test-results/lob-profissional/desktop-diagnostico-mapa.png", fullPage: true });

  await page.getByRole("button", { name: /Ver cronograma no Gantt/ }).click();
  await expect(page.getByRole("heading", { name: "Gantt QA" })).toBeVisible();

  await page.goto("/lob-qa.html");
  await page.getByRole("button", { name: /Revisar atividades/ }).click();
  await page.getByLabel("Local QA.01").fill("P01");
  await page.getByLabel("Local QA.02").fill("P02");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("lob-qa"))).toContain('"pavimento":"P01"');
  await expect.poll(() => page.evaluate(() => localStorage.getItem("lob-qa"))).toContain('"pavimento":"P02"');
  await expect(page.locator('svg[role="img"] polyline')).toHaveCount(2);
  await expect(page.locator('svg[role="img"] circle')).toHaveCount(4);
  await expect(page.locator(".lob-pro-servicos")).toContainText("Alvenaria");
  const coordenadas = await page.locator('svg[role="img"]').evaluate(svg => {
    const [, , largura, altura] = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
    return [...svg.querySelectorAll("polyline")].flatMap(linha =>
      (linha.getAttribute("points") ?? "").trim().split(/\s+/).map(ponto => ponto.split(",").map(Number))
    ).every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= largura && y >= 0 && y <= altura);
  });
  expect(coordenadas).toBe(true);
  await page.screenshot({ path: "test-results/lob-profissional/desktop-serie-p01-p02.png", fullPage: true });
  expect(erros).toEqual([]);
});

test("diagnóstico e mapa são legíveis no celular sem rolagem global", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lob-qa.html");
  await expect(page.getByText("LINHA DE RITMO AINDA NÃO DISPONÍVEL")).toBeVisible();
  await expect(page.locator(".lob-pro-mapa-rolagem")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/lob-profissional/mobile-diagnostico-mapa.png", fullPage: true });
});
