// Mede o efeito colateral do piso tipografico: algum texto grande foi
// ENCOLHIDO porque o `1em` do piso vale o tamanho do pai, nao o do proprio
// elemento?
//
// Metodo: em cada tela, mede o tamanho de fonte de todo elemento que tem texto
// proprio; depois desliga as declaracoes de `font-size` que vem da camada de
// campo (identificadas por usarem a variavel `--campo-fonte-min`); mede de novo;
// e lista o que ficou menor.
//
//   node verificar-encolhimento.mjs [url]

import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const TOKEN = readFileSync("C:/Users/Correta Engenharia/obras-sessao.txt", "utf8").trim();
const HOST = new URL(URL_BASE).hostname;

const navegador = await chromium.launch({ channel: "chrome" });
const contexto = await navegador.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
await contexto.addCookies([
  { name: "app_session_id", value: TOKEN, domain: HOST, path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
]);
const pagina = await contexto.newPage();
await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
await pagina.waitForFunction(() => document.querySelector(".xl-app") !== null, { timeout: 180000 });
await pagina.waitForTimeout(4000);

const abrirGaveta = async () => {
  const aberta = await pagina.evaluate(() => !!document.querySelector(".xl-pasta-sidebar.menu-mobile-aberto"));
  if (aberta) return;
  await pagina.evaluate(() => document.querySelector(".xl-menu-mobile")?.click());
  await pagina.waitForTimeout(800);
};

await abrirGaveta();
const telas = await pagina.evaluate(() =>
  Array.from(document.querySelectorAll(".xl-sidebar-item"))
    .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
);

const medirFontes = () =>
  pagina.evaluate(() => {
    const visivel = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const out = [];
    let indice = 0;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!visivel(el)) continue;
      const temTexto = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent || "").trim()
      );
      if (!temTexto) continue;
      const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      out.push({
        id: `${el.tagName.toLowerCase()}.${c}#${indice++}`,
        fs: parseFloat(getComputedStyle(el).fontSize),
        texto: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30),
      });
    }
    return out;
  });

// Desliga so as declaracoes de fonte que vieram da camada de campo.
const desligarPiso = () =>
  pagina.evaluate(() => {
    let removidas = 0;
    const varrer = (lista) => {
      for (const regra of Array.from(lista)) {
        // ATENCAO: no Chrome atual toda regra de estilo tem `cssRules` (uma
        // lista vazia) por causa do suporte a aninhamento. Testar a existencia
        // de `cssRules` para decidir "isto e um agrupamento" faz o laco nunca
        // olhar o `style` -- foi assim que a primeira versao deste teste
        // desligou zero regras e nao mediu nada. O tipo decide: 1 = estilo.
        if (regra.type === 1 && regra.style) {
          const valor = regra.style.getPropertyValue("font-size");
          if (valor && valor.includes("--campo-fonte-min")) {
            regra.style.removeProperty("font-size");
            removidas += 1;
          }
        }
        if (regra.cssRules && regra.cssRules.length) varrer(regra.cssRules);
      }
    };
    for (const folha of Array.from(document.styleSheets)) {
      let regras;
      try {
        regras = folha.cssRules;
      } catch {
        continue;
      }
      varrer(regras);
    }
    return removidas;
  });

const relatos = [];
let totalRemovidas = 0;
let totalCresceu = 0;
let telasMedidas = 0;
let maiorCrescimento = 0;
for (const rotulo of telas) {
  // O desligamento e irreversivel (mexe no CSSOM), entao so vale para a tela em
  // que foi feito. Recarregar a pagina antes de cada tela devolve a camada ao
  // estado original -- sem isso, so a primeira tela era de fato comparada e o
  // resultado parecia limpo por nao estar medindo nada.
  await pagina.reload({ waitUntil: "domcontentloaded" });
  await pagina.waitForFunction(() => document.querySelector(".xl-app") !== null, { timeout: 120000 });
  await pagina.waitForTimeout(2000);

  await abrirGaveta();
  const entrou = await pagina.evaluate((r) => {
    const el = Array.from(document.querySelectorAll(".xl-sidebar-item")).find(
      (x) => (x.textContent || "").replace(/\s+/g, " ").trim() === r
    );
    if (el instanceof HTMLElement) { el.click(); return true; }
    return false;
  }, rotulo);
  if (!entrou) continue;
  await pagina.waitForTimeout(2000);
  await abrirGaveta();

  const comPiso = await medirFontes();
  const removidas = await desligarPiso();
  await pagina.waitForTimeout(400);
  const semPiso = await medirFontes();

  if (telasMedidas === 0) totalRemovidas = removidas;
  telasMedidas += 1;

  const mapa = new Map(semPiso.map((x) => [x.id, x]));
  for (const c of comPiso) {
    const s = mapa.get(c.id);
    if (!s) continue;
    if (c.fs < s.fs - 0.01) relatos.push({ tela: rotulo, ...c, antes: s.fs });
    if (c.fs > s.fs + 0.01) {
      totalCresceu += 1;
      maiorCrescimento = Math.max(maiorCrescimento, c.fs - s.fs);
    }
  }
}

console.log("\n=== Controle do teste ===");
console.log(`  regras de fonte desligadas em cada tela: ${totalRemovidas}`);
console.log(`  elementos que CRESCERAM com o piso: ${totalCresceu} (maior salto: ${maiorCrescimento.toFixed(1)}px)`);
console.log(`  telas medidas: ${telasMedidas}`);
if (totalRemovidas === 0 || totalCresceu === 0) {
  console.log("  ATENCAO: o teste nao esta medindo nada -- resultado invalido.");
}

console.log("\n=== Texto ENCOLHIDO pelo piso (o efeito colateral) ===");
if (relatos.length === 0) {
  console.log("  nenhum: o piso so aumentou texto, em nenhuma tela encolheu nada.");
} else {
  const agrupado = new Map();
  for (const r of relatos) {
    const v = agrupado.get(r.id) || { id: r.id, n: 0, exemplo: r.texto, menor: 99, antes: 0, telas: new Set() };
    v.n += 1;
    v.menor = Math.min(v.menor, r.fs);
    v.antes = Math.max(v.antes, r.antes);
    v.telas.add(r.tela);
    agrupado.set(r.id, v);
  }
  for (const v of [...agrupado.values()].sort((a, b) => b.antes - a.antes)) {
    console.log(
      `  ${String(v.antes).padStart(5)}px -> ${String(v.menor).padStart(5)}px  ${String(v.n).padStart(3)}x  ${v.id.padEnd(44)} "${v.exemplo}"  [${[...v.telas].join(", ")}]`
    );
  }
  console.log(`\n  total: ${relatos.length} elementos encolhidos`);
}

await navegador.close();
