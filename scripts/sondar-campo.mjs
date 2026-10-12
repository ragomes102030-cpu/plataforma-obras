// Sonda o DOM de producao para identificar com precisao os elementos que
// ainda nao atendem ao padrao de toque/leitura no celular.

import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const URL_BASE = "https://plataforma-obras-api.onrender.com";
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
await pagina.waitForTimeout(5000);

const dados = await pagina.evaluate(() => {
  const caminho = (el) => {
    const partes = [];
    for (let p = el; p && p !== document.body && partes.length < 6; p = p.parentElement) {
      const cls = typeof p.className === "string" ? p.className.trim().split(/\s+/)[0] : "";
      partes.unshift(cls ? `${p.tagName.toLowerCase()}.${cls}` : p.tagName.toLowerCase());
    }
    return partes.join(" > ");
  };

  const botoes = Array.from(
    document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role="button"]')
  )
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        sel: caminho(el),
        classe: typeof el.className === "string" ? el.className.trim() : "",
        texto: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24),
        w: Math.round(r.width),
        h: Math.round(r.height),
        x: Math.round(r.x),
        y: Math.round(r.y),
        minW: s.minWidth,
        minH: s.minHeight,
        pad: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
      };
    });

  // Todos os elementos com classe, para descobrir os nomes reais de navegacao
  const classes = {};
  for (const el of Array.from(document.querySelectorAll("[class]"))) {
    if (typeof el.className !== "string") continue;
    for (const c of el.className.trim().split(/\s+/)) {
      if (c.startsWith("xl-") || c.startsWith("eap-") || c.startsWith("pl-") || c.startsWith("arquimedes")) {
        classes[c] = (classes[c] || 0) + 1;
      }
    }
  }

  // O elemento cortado .bloqueado, com sua ascendencia
  const bloq = Array.from(document.querySelectorAll(".bloqueado")).map((el) => {
    const r = el.getBoundingClientRect();
    const anc = [];
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      const pr = p.getBoundingClientRect();
      anc.push({
        sel: `${p.tagName.toLowerCase()}.${typeof p.className === "string" ? p.className.trim().split(/\s+/)[0] : ""}`,
        x: Math.round(pr.x),
        w: Math.round(pr.width),
        scrollW: p.scrollWidth,
        clientW: p.clientWidth,
        overflowX: s.overflowX,
      });
    }
    return { texto: (el.textContent || "").trim(), x: Math.round(r.x), w: Math.round(r.width), anc };
  });

  return { botoes, classes, bloq, titulo: document.title };
});

console.log("titulo:", dados.titulo);

console.log("\n== Classes de navegacao presentes ==");
for (const [c, n] of Object.entries(dados.classes).sort()) console.log(`  ${c.padEnd(34)} ${n}`);

console.log("\n== Botoes/controles: " + dados.botoes.length + " ==");
for (const b of dados.botoes) {
  const marca = b.w < 44 || b.h < 44 ? "  <-- CURTO" : "";
  console.log(
    `  ${String(b.w).padStart(4)}x${String(b.h).padStart(3)} @${String(b.x).padStart(4)},${String(b.y).padStart(4)}` +
      `  min=${b.minW}/${b.minH}  pad=${b.pad}  "${b.texto}"  [${b.classe}]${marca}`
  );
  console.log(`        ${b.sel}`);
}

console.log("\n== .bloqueado ==");
for (const b of dados.bloq) {
  console.log(`  "${b.texto}" x=${b.x} w=${b.w}`);
  for (const a of b.anc) console.log(`     ^ ${a.sel} x=${a.x} w=${a.w} scrollW=${a.scrollW} clientW=${a.clientW} overflowX=${a.overflowX}`);
}

await navegador.close();
