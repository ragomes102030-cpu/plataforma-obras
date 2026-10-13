// Lista os elementos com conteudo cortado na horizontal, tela por tela.
//
// Serve para saber se um aumento de "cortados" veio do piso tipografico e ONDE
// ele bateu. Rode com e sem:
//
//   node listar-cortados.mjs <url> <largura> <altura> [--sem-piso]
//
// `--sem-piso` desliga em tempo de execucao as declaracoes de `font-size` que
// usam o token do piso (--texto-min / --campo-fonte-min), sem rebuild.

import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const LARGURA = Number(process.argv[3] || 768);
const ALTURA = Number(process.argv[4] || 1024);
const SEM_PISO = process.argv.includes("--sem-piso");
const DEDO = process.argv.includes("--dedo") || LARGURA < 621;
const TOKEN = readFileSync("C:/Users/Correta Engenharia/obras-sessao.txt", "utf8").trim();
const HOST = new URL(URL_BASE).hostname;

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
pagina.on("console", (m) => {
  if (m.type() === "error") console.log("  [console] " + m.text().slice(0, 160));
});

await pagina.goto(URL_BASE + "/", { waitUntil: "domcontentloaded" });
await pagina.waitForTimeout(6000);

if (SEM_PISO) {
  const removidas = await pagina.evaluate(() => {
    const alvo = "(--texto-min|--campo-fonte-min)";
    const re = new RegExp(alvo);
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
            if (v && re.test(v)) {
              regra.style.removeProperty("font-size");
              n += 1;
            }
          }
        }
      };
      anda(regras);
    }
    return n;
  });
  console.log(`\n[--sem-piso] regras de fonte desligadas: ${removidas}`);
  await pagina.waitForTimeout(500);
}

async function abrirGaveta(pg) {
  const jaAberta = await pg.evaluate(() => !!document.querySelector(".xl-pasta-sidebar.menu-mobile-aberto"));
  if (jaAberta) return;
  await pg.evaluate(() => {
    const b = document.querySelector(".xl-menu-mobile");
    if (b instanceof HTMLElement) b.click();
  });
  await pg.waitForTimeout(800);
}

async function irPara(pg, rotulo) {
  await abrirGaveta(pg);
  const achou = await pg.evaluate((r) => {
    const el = Array.from(document.querySelectorAll(".xl-sidebar-item")).find(
      (x) => (x.textContent || "").replace(/\s+/g, " ").trim() === r
    );
    if (el instanceof HTMLElement) {
      el.click();
      return true;
    }
    return false;
  }, rotulo);
  await pagina.waitForTimeout(3000);
  return achou;
}

await abrirGaveta(pagina);
const listaTelas = await pagina.evaluate(() =>
  Array.from(document.querySelectorAll(".xl-sidebar-item"))
    .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
);

const medir = () =>
  pagina.evaluate(() => {
    const visivel = (el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const descreve = (el) => ({
      tag: el.tagName.toLowerCase(),
      classe: typeof el.className === "string" ? el.className : el.getAttribute("class") || "",
      texto: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
    });
    const rola = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflow)) return true;
      }
      return false;
    };

    const achados = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!visivel(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.left > window.innerWidth) continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      const s = getComputedStyle(el);
      if (s.textOverflow === "ellipsis") continue;
      if (/auto|scroll/.test(s.overflowX)) continue;
      if (rola(el)) continue;
      achados.push({
        excesso: el.scrollWidth - el.clientWidth,
        caixa: el.clientWidth,
        conteudo: el.scrollWidth,
        fonte: parseFloat(s.fontSize),
        ...descreve(el),
      });
    }
    return achados.sort((a, b) => b.excesso - a.excesso);
  });

console.log(`\n== Cortados horizontais em ${LARGURA}x${ALTURA} (${SEM_PISO ? "sem piso" : "com piso"}) ==`);
for (const rotulo of listaTelas) {
  if (!(await irPara(pagina, rotulo))) continue;
  const achados = await medir();
  await abrirGaveta(pagina);
  if (!achados.length) continue;
  console.log(`\n  ${rotulo}  (${achados.length})`);
  for (const a of achados.slice(0, 12)) {
    console.log(`    +${String(a.excesso).padStart(3)}px  caixa=${String(a.caixa).padStart(4)} conteudo=${String(a.conteudo).padStart(4)}  ${String(a.fonte).padStart(5)}px  <${a.tag}> .${a.classe.slice(0, 30).padEnd(30)} "${a.texto}"`);
  }
}
console.log("");

await navegador.close();
