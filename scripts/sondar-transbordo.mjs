// Sonda um unico elemento que aparece no relatorio como "transbordo vertical
// visivel" (scrollHeight > clientHeight com overflow: visible). Serve para
// decidir, com numero na mao, se o texto realmente sai da caixa ou se e apenas
// a metrica do glifo -- o auditor nao consegue distinguir sozinho.
//
// Uso: node sondar-transbordo.mjs <url> <tela> <seletor>
import { chromium, devices } from "playwright";
import { readFileSync } from "fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const TELA = process.argv[3] || "ESCOPO";
const SELETOR = process.argv[4] || ".scopo-btn.secondary";
const SESSAO = readFileSync("C:\\Users\\Correta Engenharia\\obras-sessao.txt", "utf8").trim();

const navegador = await chromium.launch({ channel: "chrome", headless: true });
const contexto = await navegador.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
await contexto.addCookies([
  { name: "app_session_id", value: SESSAO, domain: "localhost", path: "/", httpOnly: true, secure: true },
  { name: "app_session_id", value: SESSAO, domain: "plataforma-obras-3.onrender.com", path: "/", httpOnly: true, secure: true },
]);
const pagina = await contexto.newPage();
await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await pagina.waitForSelector(".xl-app", { timeout: 60000 });

// abre a gaveta e navega ate a tela
await pagina.click(".xl-menu-mobile");
await pagina.waitForTimeout(400);
await pagina.getByText(TELA, { exact: false }).first().click();
await pagina.waitForTimeout(1200);

const dados = await pagina.evaluate((sel) => {
  const todos = Array.from(document.querySelectorAll(sel));
  if (!todos.length) return { erro: "seletor nao encontrado", quantos: 0 };
  return {
    quantos: todos.length,
    itens: todos.map((el) => {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  // altura de uma linha de verdade: mede o Range do texto dentro do elemento
  const intervalo = document.createRange();
  intervalo.selectNodeContents(el);
  const linhas = intervalo.getClientRects();
  const pai = el.parentElement ? getComputedStyle(el.parentElement) : null;
  return {
    texto: (el.textContent || "").trim(),
    caixa: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) },
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    transbordo: el.scrollHeight - el.clientHeight,
    overflowY: s.overflowY,
    height: s.height,
    minHeight: s.minHeight,
    padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
    border: `${s.borderTopWidth}/${s.borderBottomWidth}`,
    fonte: s.fontSize,
    peso: s.fontWeight,
    familia: s.fontFamily.slice(0, 40),
    lineHeight: s.lineHeight,
    display: s.display,
    alignItems: s.alignItems,
    whiteSpace: s.whiteSpace,
    // se o texto ocupa 2 rects, ele quebrou em 2 linhas
    quantidadeDeLinhas: linhas.length,
    alturaDasLinhas: [...linhas].map((l) => Math.round(l.height)),
    rectDoTexto: linhas.length
      ? {
          topo: Math.round(Math.min(...[...linhas].map((l) => l.top))),
          base: Math.round(Math.max(...[...linhas].map((l) => l.bottom))),
        }
      : null,
    paiFonte: pai ? pai.fontSize : null,
  };
    }),
  };
}, SELETOR);

console.log(JSON.stringify({ tela: TELA, seletor: SELETOR, ...dados }, null, 2));
await navegador.close();
