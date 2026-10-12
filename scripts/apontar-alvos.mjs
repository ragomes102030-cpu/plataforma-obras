// Aponta, com classe e contexto, os elementos clicaveis menores que 44px numa
// tela do celular. Serve para saber o que exatamente apertar.
//
// Uso: node scripts/apontar-alvos.mjs <url> <indice-da-tela>
import { chromium } from "playwright";
import { readFileSync } from "fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const INDICE = Number(process.argv[3] ?? 3);
const SESSAO = readFileSync("C:\\Users\\Correta Engenharia\\obras-sessao.txt", "utf8").trim();

const navegador = await chromium.launch({ channel: "chrome", headless: true });
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
});
await contexto.addCookies([{ name: "app_session_id", value: SESSAO, domain: "localhost", path: "/", httpOnly: true, secure: true }]);
const pagina = await contexto.newPage();
await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await pagina.waitForSelector(".xl-app", { timeout: 60000 });
await pagina.waitForTimeout(2500);

await pagina.locator(".xl-menu-mobile").first().click();
await pagina.waitForTimeout(400);
await pagina.locator(".xl-sidebar-item").nth(INDICE).click();
await pagina.waitForTimeout(2000);

const achados = await pagina.evaluate(() => {
  const caminho = el => {
    const partes = [];
    let n = el;
    for (let i = 0; i < 4 && n && n.tagName !== "BODY"; i++) {
      let p = n.tagName.toLowerCase();
      if (n.className && typeof n.className === "string") p += "." + n.className.trim().split(/\s+/).join(".");
      partes.unshift(p);
      n = n.parentElement;
    }
    return partes.join(" > ");
  };
  const fora = [];
  for (const el of document.querySelectorAll("button, a, input, select, textarea, [role=button]")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    if (r.height < 44) {
      fora.push({
        caminho: caminho(el),
        altura: Math.round(r.height * 10) / 10,
        largura: Math.round(r.width),
        tipo: el.type || el.tagName,
        texto: (el.placeholder || el.value || el.textContent || "").trim().slice(0, 30),
        fonte: cs.fontSize,
        padding: cs.padding,
        minAltura: cs.minHeight,
        caixa: cs.boxSizing,
      });
    }
  }
  return fora;
});

console.log(`alvos menores que 44px na tela ${INDICE}: ${achados.length}`);
for (const a of achados) console.log(JSON.stringify(a, null, 1));
await navegador.close();
