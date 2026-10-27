import { test, expect } from "@playwright/test";

test("Desktop: EAP real, seleção, versão, filtros, busca e vínculos",async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/eap-studio.html");
  await expect(page.getByRole("heading",{name:/Estrutura Analítica da Obra/})).toBeVisible();
  await expect(page.locator(".stat")).toHaveCount(4);
  await expect(page.locator("#rows .row")).toHaveCount(16);
  await page.locator("#expandBtn").click();
  await expect(page.locator("#rows .row")).toHaveCount(69);
  await page.locator("#search").fill("Fundações");
  // Fundações aparece também em "Impermeabilização de fundações e áreas enterradas".
  // Ambos são resultados válidos; o teste seleciona o pacote técnico exato.
  await expect(page.locator("#rows .row")).toHaveCount(2);
  await page.locator("#rows .row").filter({hasText:"1.3.2"}).click();
  await expect(page.locator("#detailName")).toHaveText("Fundações");
  await page.locator('[data-version="5"]').click();
  await expect(page.locator("#versionHeading")).toContainText("Aprovada");
  await expect(page.locator("#detailVersion")).toContainText("v5");
  await page.locator("#search").fill("");
  await page.locator('[data-filter="pacote"]').click();
  await expect(page.locator("#rows .row")).toHaveCount(53);
  await page.locator('[data-filter="all"]').click();
  await page.locator("[data-link='Atividades']").click();
  await expect(page.locator("#toast")).toContainText("Navegação simulada para Atividades");
  await page.screenshot({path:test.info().outputPath("eap-studio-desktop.png"),fullPage:true});
  expect(errors).toEqual([]);
});
test("Mobile 375: menu, busca, seleção e sem overflow horizontal",async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/eap-studio.html");
  await expect(page.locator("#versionHeading")).toBeVisible();
  await page.locator("#menu").click();
  await expect(page.locator("#sidebar")).toHaveClass(/open/);
  await page.locator("#menu").click();
  await page.locator("#search").fill("Telhamento");
  await expect(page.locator("#rows .row")).toHaveCount(1);
  await page.locator("#rows .row").first().click();
  await expect(page.locator("#detailName")).toContainText("Telhamento");
  const sz=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(sz.scroll).toBeLessThanOrEqual(sz.client+2);
  await page.screenshot({path:test.info().outputPath("eap-studio-375px.png"),fullPage:true});
  expect(errors).toEqual([]);
});