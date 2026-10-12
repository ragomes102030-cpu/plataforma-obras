// Mostra o que a barra lateral realmente renderiza, estado por estado, porque a
// planilha.css pinta a barra de escuro e a eap.css (que entra depois) descreve
// uma barra clara. Onde as duas empatam em especificidade, a eap.css vence.
//
// Uso: node scripts/diagnosticar-barra-lateral.mjs [url]
import { chromium } from "playwright";
import { readFileSync } from "fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const SESSAO = readFileSync("C:\\Users\\Correta Engenharia\\obras-sessao.txt", "utf8").trim();

const navegador = await chromium.launch({ channel: "chrome", headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
await contexto.addCookies([{ name: "app_session_id", value: SESSAO, domain: "localhost", path: "/", httpOnly: true, secure: true }]);
const pagina = await contexto.newPage();
await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await pagina.waitForSelector(".xl-app", { timeout: 60000 });
await pagina.waitForTimeout(3000);

const espiar = async rotulo => {
  const r = await pagina.evaluate(() => {
    const pega = (sel, props = ["color", "backgroundColor", "borderColor", "boxShadow", "fontSize", "fontWeight"]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const o = {};
      for (const p of props) o[p] = cs[p];
      return o;
    };
    return {
      "painel .xl-sidebar": pega(".xl-sidebar", ["backgroundColor"]),
      ".xl-pasta-sidebar": pega(".xl-pasta-sidebar", ["backgroundColor"]),
      ".xl-sidebar-head": pega(".xl-sidebar-head", ["backgroundColor", "borderBottomColor"]),
      ".xl-sidebar-brand strong": pega(".xl-sidebar-brand strong"),
      ".xl-sidebar-brand span": pega(".xl-sidebar-brand span"),
      ".xl-sidebar-brand > svg": pega(".xl-sidebar-brand > svg", ["color"]),
      ".xl-sidebar-toggle": pega(".xl-sidebar-toggle", ["color", "backgroundColor", "borderColor"]),
      ".xl-sidebar-label": pega(".xl-sidebar-label"),
      ".xl-sidebar-item (1o)": pega(".xl-sidebar-item"),
      ".xl-sidebar-item > svg": pega(".xl-sidebar-item > svg", ["color"]),
      ".xl-sidebar-item > span": pega(".xl-sidebar-item > span"),
      ".xl-sidebar-item small": pega(".xl-sidebar-item small"),
      ".xl-sidebar-item.ativa": pega(".xl-sidebar-item.ativa"),
      ".xl-sidebar-item.ativa > span": pega(".xl-sidebar-item.ativa > span"),
      ".xl-sidebar-foot": pega(".xl-sidebar-foot", ["backgroundColor", "borderTopColor"]),
      ".xl-sidebar-foot button": pega(".xl-sidebar-foot button"),
    };
  });
  console.log(`\n===== ${rotulo} =====`);
  for (const [k, v] of Object.entries(r)) {
    if (!v) { console.log(`${k.padEnd(30)} (ausente)`); continue; }
    const partes = Object.entries(v).filter(([, x]) => x && x !== "none" && x !== "rgba(0, 0, 0, 0)").map(([p, x]) => `${p}=${x}`);
    console.log(`${k.padEnd(30)} ${partes.join("  ")}`);
  }
};

await espiar("estado normal");
// O realce de passagem do mouse e o que mais denuncia tema misturado.
await pagina.hover(".xl-sidebar-item:nth-child(2)");
await pagina.waitForTimeout(400);
const passagem = await pagina.evaluate(() => {
  const el = document.querySelector(".xl-sidebar-item:hover");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { texto: el.innerText.trim().slice(0, 20), cor: cs.color, fundo: cs.backgroundColor };
});
console.log("\n===== com o mouse em cima =====");
console.log(JSON.stringify(passagem));
await navegador.close();
