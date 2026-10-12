// Para um elemento real da tela, lista TODAS as regras que declaram
// `font-size` e casam com ele, na ordem do documento, com o contexto de @media.
// Serve para descobrir por que um override nao esta vencendo a cascata.
//
//   node depurar-css.mjs "#seletor-ou-classe" [tela]

import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const CONSULTA = process.argv[2] || ".eap-rownum";
const TELA = process.argv[3] || null;
const URL_BASE = "http://localhost:4599";
const TOKEN = readFileSync("C:/Users/Correta Engenharia/obras-sessao.txt", "utf8").trim();

const navegador = await chromium.launch({ channel: "chrome" });
const contexto = await navegador.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
await contexto.addCookies([
  { name: "app_session_id", value: TOKEN, domain: "localhost", path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
]);
const pagina = await contexto.newPage();
await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
await pagina.waitForFunction(() => document.querySelector(".xl-app") !== null, { timeout: 120000 });
await pagina.waitForTimeout(3000);

const abrirGaveta = async () => {
  const aberta = await pagina.evaluate(() => !!document.querySelector(".xl-pasta-sidebar.menu-mobile-aberto"));
  if (aberta) return;
  await pagina.evaluate(() => document.querySelector(".xl-menu-mobile")?.click());
  await pagina.waitForTimeout(800);
};

if (TELA) {
  await abrirGaveta();
  await pagina.evaluate((r) => {
    const el = Array.from(document.querySelectorAll(".xl-sidebar-item")).find(
      (x) => (x.textContent || "").replace(/\s+/g, " ").trim() === r
    );
    el?.click();
  }, TELA);
  await pagina.waitForTimeout(2500);
  await abrirGaveta();
}

const saida = await pagina.evaluate((consulta) => {
  const alvo = document.querySelector(consulta);
  if (!alvo) return { erro: `nada casou com ${consulta}` };

  // Percorre o CSSOM guardando o caminho de @media de cada regra.
  const regras = [];
  const varrer = (lista, caminho) => {
    for (const regra of Array.from(lista)) {
      if (regra.type === 4 || regra.media) {
        const cond = regra.conditionText || regra.media?.mediaText || "?";
        varrer(regra.cssRules, [...caminho, cond]);
        continue;
      }
      if (regra.type !== 1 || !regra.style) continue;
      if (!regra.style.getPropertyValue("font-size")) continue;
      regras.push({
        seletor: (regra.selectorText || "").replace(/\s+/g, " "),
        media: caminho.join(" e "),
        valor: regra.style.getPropertyValue("font-size"),
        importante: regra.style.getPropertyPriority("font-size") === "important",
      });
    }
  };
  for (const folha of Array.from(document.styleSheets)) {
    try {
      varrer(folha.cssRules, []);
    } catch (e) {
      regras.push({ seletor: "(folha ilegivel)", media: "", valor: String(e), importante: false });
    }
  }

  const casam = regras.filter((r) => {
    try {
      return alvo.matches(r.seletor);
    } catch {
      return false;
    }
  });

  return {
    alvo: {
      tag: alvo.tagName.toLowerCase(),
      classe: typeof alvo.className === "string" ? alvo.className : "",
      texto: (alvo.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
      computado: getComputedStyle(alvo).fontSize,
    },
    totalRegrasComFonte: regras.length,
    casam,
  };
}, CONSULTA);

console.log(`\nalvo: <${saida.alvo?.tag}> classe="${saida.alvo?.classe}" texto="${saida.alvo?.texto}"`);
console.log(`font-size computado: ${saida.alvo?.computado}`);
console.log(`regras com font-size na folha: ${saida.totalRegrasComFonte}`);
console.log(`regras que casam com o alvo: ${saida.casam?.length}`);
for (const r of saida.casam || []) {
  console.log(`  ${r.media ? "@media " + r.media : "(sem @media)".padEnd(8)}  ${r.valor}${r.importante ? " !important" : ""}  <- ${r.seletor.slice(0, 120)}`);
}

await navegador.close();
