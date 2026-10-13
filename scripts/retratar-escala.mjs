// Retrato da escala tipografica como o USUARIO ve: percorre as 15 telas, olha o
// tamanho de fonte calculado de cada texto visivel e conta quantos valores
// distintos aparecem.
//
//   node retratar-escala.mjs <url> <largura> <altura> [--sem-escala] [--sem-piso]
//
// `--sem-escala` desliga em tempo de execucao so as regras do encaixe na escala
// (as que usam var(--texto-corpo|forte|sub|secao|titulo|pagina|heroi));
// `--sem-piso` desliga as do piso. Sem rebuild, na mesma carga de pagina.

import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const LARGURA = Number(process.argv[3] || 1440);
const ALTURA = Number(process.argv[4] || 900);
const SEM_ESCALA = process.argv.includes("--sem-escala");
const SEM_PISO = process.argv.includes("--sem-piso");
const DEDO = process.argv.includes("--dedo") || LARGURA < 621;
const TOKEN = readFileSync("C:/Users/Correta Engenharia/obras-sessao.txt", "utf8").trim();
const HOST = new URL(URL_BASE).hostname;

// A escala declarada em theme-tokens.css. Manter em sincronia com
// scripts/gerar-tipografia-desktop.mjs.
const ESCALA = [12.5, 14, 16, 18, 20, 22, 24, 26];

const navegador = await chromium.launch({ channel: "chrome" });
const contexto = await navegador.newContext(
  DEDO
    ? { ...devices["iPhone 13"], viewport: { width: LARGURA, height: ALTURA }, screen: { width: LARGURA, height: ALTURA } }
    : { viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1, hasTouch: false, isMobile: false }
);
await contexto.addCookies([
  { name: "app_session_id", value: TOKEN, domain: HOST, path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
]);
const pagina = await contexto.newPage();
await pagina.goto(URL_BASE + "/", { waitUntil: "domcontentloaded" });
await pagina.waitForTimeout(6000);

const PADRAO_ESCALA = "--texto-(corpo|forte|sub|secao|titulo|pagina|heroi)";
const PADRAO_PISO = "(--texto-min|--campo-fonte-min)";
const PADROES = [SEM_ESCALA && PADRAO_ESCALA, SEM_PISO && PADRAO_PISO].filter(Boolean);
if (PADROES.length) {
  const removidas = await pagina.evaluate((padroes) => {
    const res = padroes.map((p) => new RegExp(p));
    let n = 0;
    for (const folha of Array.from(document.styleSheets)) {
      let regras;
      try {
        regras = folha.cssRules;
      } catch {
        continue;
      }
      const anda = (lista) => {
        for (const regra of Array.from(lista)) {
          if (regra.cssRules) anda(regra.cssRules);
          if (regra.style) {
            const v = regra.style.getPropertyValue("font-size");
            if (v && res.some((re) => re.test(v))) {
              regra.style.removeProperty("font-size");
              n += 1;
            }
          }
        }
      };
      anda(regras);
    }
    return n;
  }, PADROES);
  console.log(`\n[desligado: ${[SEM_ESCALA ? "escala" : null, SEM_PISO ? "piso" : null].filter(Boolean).join(" + ")}] regras removidas: ${removidas}`);
  await pagina.waitForTimeout(500);
}

async function abrirGaveta() {
  const jaAberta = await pagina.evaluate(() => !!document.querySelector(".xl-pasta-sidebar.menu-mobile-aberto"));
  if (jaAberta) return;
  await pagina.evaluate(() => {
    const b = document.querySelector(".xl-menu-mobile");
    if (b instanceof HTMLElement) b.click();
  });
  await pagina.waitForTimeout(800);
}

await abrirGaveta();
const telas = await pagina.evaluate(() =>
  Array.from(document.querySelectorAll(".xl-sidebar-item"))
    .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
);

const contagem = new Map(); // "14" -> { n, exemplos: Set }
for (const rotulo of telas) {
  await abrirGaveta();
  await pagina.evaluate((r) => {
    const el = Array.from(document.querySelectorAll(".xl-sidebar-item")).find(
      (x) => (x.textContent || "").replace(/\s+/g, " ").trim() === r
    );
    if (el instanceof HTMLElement) el.click();
  }, rotulo);
  await pagina.waitForTimeout(2500);

  const leituras = await pagina.evaluate(() => {
    const visivel = (el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const saida = [];
    const anda = (el) => {
      for (const no of Array.from(el.childNodes)) {
        if (no.nodeType === 3 && (no.textContent || "").trim()) {
          const s = getComputedStyle(el);
          saida.push({
            px: parseFloat(s.fontSize),
            classe: `${el.tagName.toLowerCase()}.${(typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`,
          });
        } else if (no.nodeType === 1 && visivel(no)) {
          anda(no);
        }
      }
    };
    anda(document.body);
    return saida;
  });

  for (const l of leituras) {
    const chave = String(l.px);
    if (!contagem.has(chave)) contagem.set(chave, { px: l.px, n: 0, exemplos: new Set() });
    const g = contagem.get(chave);
    g.n += 1;
    if (g.exemplos.size < 3) g.exemplos.add(l.classe);
  }
}

const ordem = [...contagem.values()].sort((a, b) => a.px - b.px);
const fora = ordem.filter((g) => !ESCALA.includes(g.px));

console.log(`\n== Escala tipografica em ${LARGURA}x${ALTURA} (${SEM_ESCALA ? "sem escala" : SEM_PISO ? "sem piso" : "com piso e escala"}) ==`);
console.log(`Telas percorridas: ${telas.length}\n`);
console.log("  valor     textos   degrau?  onde");
for (const g of ordem) {
  const marca = ESCALA.includes(g.px) ? "   sim  " : "  FORA  ";
  console.log(`  ${String(g.px).padStart(5)}px ${String(g.n).padStart(8)} ${marca}  ${[...g.exemplos].join("  ")}`);
}
console.log(`\n  valores distintos: ${ordem.length}   fora da escala: ${fora.length}`);
console.log(`  abaixo do piso (12,5px): ${ordem.filter((g) => g.px < 12.5).length}\n`);

await navegador.close();
