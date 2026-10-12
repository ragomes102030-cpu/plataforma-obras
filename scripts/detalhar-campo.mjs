// Detalha cada elemento reprovado: a cadeia de ancestrais e, no caso de caixas
// de selecao, qual e o alvo de toque real (o `label` que as envolve).

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
  const jaAberta = await pagina.evaluate(() => !!document.querySelector(".xl-pasta-sidebar.menu-mobile-aberto"));
  if (jaAberta) return;
  await pagina.evaluate(() => document.querySelector(".xl-menu-mobile")?.click());
  await pagina.waitForTimeout(800);
};

const telas = await pagina.evaluate(() => []); // preenchido abaixo
await abrirGaveta();
const listaTelas = await pagina.evaluate(() =>
  Array.from(document.querySelectorAll(".xl-sidebar-item"))
    .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
);
void telas;

const coletado = [];
for (const rotulo of listaTelas) {
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

  const achados = await pagina.evaluate(() => {
    const caminho = (el, limite = 5) => {
      const p = [];
      for (let n = el; n && n !== document.body && p.length < limite; n = n.parentElement) {
        const c = typeof n.className === "string" ? n.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
        p.unshift(c ? `${n.tagName.toLowerCase()}.${c}` : n.tagName.toLowerCase());
      }
      return p.join(" > ");
    };
    const visivel = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const descreve = (el) => ({
      tag: el.tagName.toLowerCase(),
      classe: typeof el.className === "string" ? el.className.trim() : "",
      texto: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 26),
    });

    const pequenos = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!visivel(el)) continue;
      if (el.closest("svg")) continue;
      const temTexto = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim());
      if (!temTexto) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12.5) pequenos.push({ fs, caminho: caminho(el), ...descreve(el) });
    }

    const curtos = [];
    for (const el of Array.from(document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role="button"]'))) {
      if (!visivel(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= 44 && r.height >= 44) continue;
      const tipo = el.getAttribute("type");
      const ehCaixa = el.tagName === "INPUT" && (tipo === "checkbox" || tipo === "radio");
      // O alvo real de uma caixa de selecao e o `label` que a envolve: tocar no
      // texto do label tambem alterna a caixa.
      const label = ehCaixa ? el.closest("label") : null;
      const rl = label ? label.getBoundingClientRect() : null;
      curtos.push({
        w: Math.round(r.width),
        h: Math.round(r.height),
        ehCaixa,
        label: label ? { w: Math.round(rl.width), h: Math.round(rl.height) } : null,
        caminho: caminho(el),
        ...descreve(el),
      });
    }
    return { pequenos, curtos };
  });

  coletado.push({ rotulo, ...achados });
}

console.log("\n=== TEXTO PEQUENO: de onde vem o tamanho ===");
const vistosTexto = new Set();
for (const t of coletado) {
  for (const p of t.pequenos) {
    const k = `${p.classe}|${p.fs}`;
    if (vistosTexto.has(k)) continue;
    vistosTexto.add(k);
    console.log(`\n  ${p.fs}px  <${p.tag}> "${p.texto}"  [${t.rotulo}]`);
    console.log(`     classe: ${p.classe}`);
    console.log(`     ${p.caminho}`);
  }
}

console.log("\n\n=== ALVO CURTO: de onde vem o tamanho ===");
const vistosAlvo = new Set();
for (const t of coletado) {
  for (const a of t.curtos) {
    const k = `${a.classe}|${a.tag}|${a.ehCaixa}|${a.w}x${a.h}`;
    if (vistosAlvo.has(k)) continue;
    vistosAlvo.add(k);
    const lbl = a.label ? `  label=${a.label.w}x${a.label.h}` : "";
    console.log(`\n  ${a.w}x${a.h}${lbl}  <${a.tag}> "${a.texto}"  [${t.rotulo}]`);
    console.log(`     classe: ${a.classe}`);
    console.log(`     ${a.caminho}`);
  }
}

await navegador.close();
