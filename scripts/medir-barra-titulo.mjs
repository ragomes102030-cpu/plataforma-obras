// Fotografa a arvore de caixas da barra de titulo para descobrir QUEM esta
// espremendo os botoes de destino. Sem isso, mexer no layout e chute.
//
//   node medir-barra-titulo.mjs <url> <largura> <altura>

import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const LARGURA = Number(process.argv[3] || 768);
const ALTURA = Number(process.argv[4] || 1024);
const TOKEN = readFileSync("C:/Users/Correta Engenharia/obras-sessao.txt", "utf8").trim();
const HOST = new URL(URL_BASE).hostname;

const navegador = await chromium.launch({ channel: "chrome" });
const contexto = await navegador.newContext({
  viewport: { width: LARGURA, height: ALTURA },
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
});
await contexto.addCookies([
  { name: "app_session_id", value: TOKEN, domain: HOST, path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
]);
const pagina = await contexto.newPage();
await pagina.goto(URL_BASE + "/", { waitUntil: "domcontentloaded" });
await pagina.waitForTimeout(6000);

const arvore = await pagina.evaluate(() => {
  const raiz = document.querySelector(".xl-titlebar");
  if (!raiz) return null;
  const linhas = [];
  const visita = (el, nivel) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const texto = (el.childNodes.length === 1 && el.textContent ? el.textContent : "").trim().slice(0, 26);
    linhas.push({
      nivel,
      nome: `${el.tagName.toLowerCase()}.${(typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`,
      caixa: Math.round(r.width),
      conteudo: el.scrollWidth,
      flex: `${s.flexGrow} ${s.flexShrink} ${s.flexBasis}`,
      minW: s.minWidth,
      wrap: s.flexWrap,
      dir: s.flexDirection,
      overflowX: s.overflowX,
      pad: s.paddingLeft + "/" + s.paddingRight,
      texto,
    });
    if (nivel < 3) for (const f of Array.from(el.children)) visita(f, nivel + 1);
  };
  visita(raiz, 0);
  return linhas;
});

console.log(`\n== Arvore da barra de titulo em ${LARGURA}x${ALTURA} ==\n`);
if (!arvore) console.log("  .xl-titlebar nao encontrada");
else {
  for (const l of arvore) {
    console.log(
      `  ${"  ".repeat(l.nivel)}${l.nome.slice(0, 44).padEnd(46)} caixa=${String(l.caixa).padStart(4)} conteudo=${String(l.conteudo).padStart(4)} flex=${l.flex.padEnd(12)} minW=${l.minW.padEnd(9)} wrap=${l.wrap.padEnd(7)} pad=${l.pad.padEnd(9)} ${l.texto}`
    );
  }
}
console.log("");
await navegador.close();
