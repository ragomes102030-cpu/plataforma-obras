// Retrata as 15 telas do sistema, no computador e no celular, para conferir a
// interface com os olhos. Nao julga nada: so salva imagem e conta o que viu.
//
// Uso: node scripts/retratar-telas.mjs [url] [saida]
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const SAIDA = process.argv[3] || "tests/telas";
const SESSAO = readFileSync("C:\\Users\\Correta Engenharia\\obras-sessao.txt", "utf8").trim();

const TELAS = [
  "dashboard", "escopo", "eap", "atividades", "dependencias", "cpm", "baseline",
  "gantt", "linha-balanco", "producao", "documentos", "suprimentos", "financeiro",
  "riscos", "curva-s",
];

mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ channel: "chrome", headless: true });
const relatorio = [];

async function abrir(largura, altura) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    hasTouch: largura < 700,
    isMobile: largura < 700,
    deviceScaleFactor: 1,
  });
  await contexto.addCookies([
    { name: "app_session_id", value: SESSAO, domain: "localhost", path: "/", httpOnly: true, secure: true },
    { name: "app_session_id", value: SESSAO, domain: "plataforma-obras-3.onrender.com", path: "/", httpOnly: true, secure: true },
  ]);
  const pagina = await contexto.newPage();
  await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector(".xl-app", { timeout: 60000 });
  await pagina.waitForTimeout(2500);
  return { contexto, pagina };
}

// Mede o que suja a tela: erros de console, rolagem horizontal e quantos
// elementos tem texto abaixo de 12,5px ou alvo abaixo de 44px.
async function medir(pagina) {
  return pagina.evaluate(() => {
    const pequenos = [], miudos = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const texto = (el.childElementCount === 0 ? el.textContent || "" : "").trim();
      if (texto) {
        const f = parseFloat(cs.fontSize);
        if (f < 12.5) pequenos.push(`${el.className || el.tagName} ${f}px "${texto.slice(0, 22)}"`);
      }
      if ((el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "INPUT") && r.height > 0 && r.height < 44) {
        miudos.push(`${el.className || el.tagName} ${Math.round(r.height)}px`);
      }
    }
    return {
      fonteMenor: pequenos,
      alvoMenor: miudos,
      rolagemX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      altura: document.documentElement.scrollHeight,
    };
  });
}

for (const [nome, largura, altura] of [["praca", 1440, 900], ["campo", 390, 844]]) {
  const { contexto, pagina } = await abrir(largura, altura);
  const erros = [];
  pagina.on("console", m => { if (m.type() === "error") erros.push(m.text().slice(0, 160)); });
  pagina.on("pageerror", e => erros.push("pageerror: " + String(e).slice(0, 160)));

  for (let i = 0; i < TELAS.length; i++) {
    const tela = TELAS[i];
    // No celular a navegacao mora dentro do drawer.
    if (largura < 700) {
      const abridor = pagina.locator(".xl-menu-mobile").first();
      if (await abridor.count()) {
        await abridor.click();
        await pagina.waitForTimeout(350);
      }
    }
    const item = pagina.locator(".xl-sidebar-item").nth(i);
    if (await item.count()) {
      await item.click();
    } else {
      relatorio.push(`${nome}/${tela}: item de navegacao nao encontrado`);
      continue;
    }
    await pagina.waitForTimeout(1800);
    const m = await medir(pagina);
    await pagina.screenshot({ path: `${SAIDA}/${nome}-${String(i + 1).padStart(2, "0")}-${tela}.png`, fullPage: false });
    relatorio.push(
      `${nome}/${tela}: altura=${m.altura}px rolagemX=${m.rolagemX}px fonte<12,5=${m.fonteMenor.length} alvo<44=${m.alvoMenor.length}` +
      (m.fonteMenor.length ? `\n     fontes: ${m.fonteMenor.slice(0, 4).join(" | ")}` : "") +
      (m.alvoMenor.length ? `\n     alvos: ${m.alvoMenor.slice(0, 4).join(" | ")}` : "")
    );
  }
  relatorio.push(`erros de console (${nome}): ${erros.length}`);
  for (const e of erros.slice(0, 6)) relatorio.push(`   ! ${e}`);
  await contexto.close();
}

writeFileSync(`${SAIDA}/relatorio.txt`, relatorio.join("\n"), "utf8");
console.log(relatorio.join("\n"));
await navegador.close();
