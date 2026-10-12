// Auditoria de uso em campo: abre a PRODUCAO emulando um iPhone 13 e mede,
// no DOM real, os defeitos que atrapalham o uso no celular.
//
//   node auditar-campo.mjs [url] [largura] [altura]
//
// Sai com codigo 0 mesmo quando encontra defeitos: o relatorio e o produto.

import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const URL_BASE = process.argv[2] || "https://plataforma-obras-api.onrender.com";
const LARGURA = Number(process.argv[3] || 390);
const ALTURA = Number(process.argv[4] || 844);
const TOKEN = readFileSync("C:/Users/Correta Engenharia/obras-sessao.txt", "utf8").trim();

const FONTE_MINIMA = 12.5; // px
const ALVO_MINIMO = 44; // px
const HOST = new URL(URL_BASE).hostname;

const navegador = await chromium.launch({ channel: "chrome" });
const contexto = await navegador.newContext({
  ...devices["iPhone 13"],
  viewport: { width: LARGURA, height: ALTURA },
  screen: { width: LARGURA, height: ALTURA },
});
await contexto.addCookies([
  {
    name: "app_session_id",
    value: TOKEN,
    domain: HOST,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  },
]);

const pagina = await contexto.newPage();
const errosConsole = [];
const errosRede = [];
pagina.on("console", (m) => {
  if (m.type() === "error") errosConsole.push(m.text().slice(0, 200));
});
pagina.on("pageerror", (e) => errosConsole.push("pageerror: " + String(e).slice(0, 200)));
pagina.on("requestfailed", (r) => {
  const u = r.url();
  if (!u.includes("favicon") && !u.includes("analytics")) {
    errosRede.push(`${r.failure()?.errorText} ${u}`.slice(0, 200));
  }
});

console.log(`\n== Auditoria de campo ==`);
console.log(`url=${URL_BASE}  viewport=${LARGURA}x${ALTURA}  dpr=3\n`);

await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
// O servico gratuito hiberna: a primeira carga pode levar ~40 s.
await pagina.waitForFunction(() => document.querySelector(".xl-app") !== null, { timeout: 180000 });
await pagina.waitForTimeout(4000); // deixa o React montar as abas

const medir = async () =>
  page_evaluate_medicoes(pagina, FONTE_MINIMA, ALVO_MINIMO);

const bruto = await medir();

console.log("-- Estrutura --");
console.log(`  document.scrollWidth = ${bruto.scrollWidth}  (viewport ${bruto.innerWidth})  -> excesso ${bruto.scrollWidth - bruto.innerWidth}px`);
console.log(`  .xl-app  altura=${bruto.appAltura} alturaVisivel=${bruto.appAlturaVisivel} padding-top=${bruto.appPadTopo} padding-bottom=${bruto.appPadBase}`);
console.log(`  service worker: registrado=${bruto.swRegistrado} controlando=${bruto.swControlando}`);
console.log(`  matchMedia(pointer:coarse)=${bruto.pointerCoarse}  touch=${bruto.temTouch}`);

console.log(`\n-- Texto abaixo de ${FONTE_MINIMA}px: ${bruto.fontes.length} --`);
for (const f of bruto.fontes.slice(0, 15)) {
  console.log(`  ${f.fontSize}px  <${f.tag}> ${f.classe}  "${f.texto}"`);
}

console.log(`\n-- Alvos de toque fora do padrao: ${bruto.alvos.length} --`);
console.log(`   (botoes/campos: minimo ${ALVO_MINIMO}px; caixas de selecao: minimo 24px, WCAG 2.5.8)`);
for (const a of bruto.alvos.slice(0, 15)) {
  console.log(
    `  ${a.w}x${a.h}  <${a.tag}> ${a.classe}${a.ehCaixa ? "  [caixa]" : ""}  "${a.texto}"`
  );
}

console.log(`\n-- Elementos cortados: ${bruto.cortados.length} horizontais, ${bruto.cortadosVerticais.length} verticais (corte real) --`);
for (const c of bruto.cortados.slice(0, 15)) {
  console.log(`  ${c.scrollWidth}>${c.clientWidth} (x=${c.x}, w=${c.w}, fora=${c.foraDaTela}px)  <${c.tag}> ${c.classe}`);
}
for (const c of bruto.cortadosVerticais.slice(0, 15)) {
  console.log(`  v: ${c.scrollHeight}>${c.clientHeight} (height=${c.altura}, overflow-y=${c.overflowY})  <${c.tag}> ${c.classe}  "${c.texto}"`);
}
if (bruto.transbordosVerticais.length) {
  console.log(`  (transbordo visivel, sem corte: ${bruto.transbordosVerticais.length} -- nao e defeito)`);
}

console.log(`\n-- Erros de console: ${errosConsole.length} --`);
for (const e of errosConsole.slice(0, 10)) console.log("  " + e);
console.log(`-- Falhas de rede: ${errosRede.length} --`);
for (const e of errosRede.slice(0, 10)) console.log("  " + e);

// A navegacao real do app nao e uma barra de abas: e uma gaveta lateral
// (`.xl-pasta-sidebar`) com itens `.xl-sidebar-item`. Numa tela de 390px ela
// fica fora da tela, entao e preciso abri-la a cada troca de tela.

async function abrirGaveta(pg) {
  const jaAberta = await pg.evaluate(() =>
    !!document.querySelector(".xl-pasta-sidebar.menu-mobile-aberto")
  );
  if (jaAberta) return;
  await pg.evaluate(() => {
    const b = document.querySelector(".xl-menu-mobile");
    if (b instanceof HTMLElement) b.click();
  });
  await pg.waitForTimeout(800);
}

async function telas(pg) {
  await abrirGaveta(pg);
  return await pg.evaluate(() =>
    Array.from(document.querySelectorAll(".xl-sidebar-item"))
      .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
  );
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
  await pg.waitForTimeout(3000);
  return achou;
}

const listaTelas = await telas(pagina);
console.log("\n-- Telas de navegacao --");
console.log("  " + JSON.stringify(listaTelas));

// Cada tela e medida: defeitos de toque e de leitura mudam de tela para tela.
const porAba = [];
await abrirGaveta(pagina); // fecha o que tiver aberto ao medir cada tela
for (const rotulo of listaTelas) {
  const entrou = await irPara(pagina, rotulo);
  if (!entrou) continue;
  const m = await medir();
  // A gaveta aberta nao faz parte da tela: mede-se a tela, nao o menu.
  await abrirGaveta(pagina);
  porAba.push({ rotulo, ...m, erros: errosConsole.length });
}

console.log("\n-- Resumo por aba --");
console.log(
  "  aba".padEnd(22) +
    "fonte<min".padStart(10) +
    "alvo<44".padStart(10) +
    "cortados".padStart(10) +
    "cort.v".padStart(8) +
    "excesso-x".padStart(11)
);
for (const a of porAba) {
  console.log(
    "  " +
      String(a.rotulo).padEnd(20) +
      String(a.fontes.length).padStart(10) +
      String(a.alvos.length).padStart(10) +
      String(a.cortados.length).padStart(10) +
      String(a.cortadosVerticais.length).padStart(8) +
      String(a.scrollWidth - a.innerWidth).padStart(11)
  );
}

const fontesTodas = porAba.flatMap((a) => a.fontes.map((f) => ({ ...f, tela: a.rotulo })));
const alvosTodos = porAba.flatMap((a) => a.alvos.map((x) => ({ ...x, tela: a.rotulo })));

console.log("\n-- Texto pequeno, agrupado por elemento --");
const porTexto = new Map();
for (const f of fontesTodas) {
  const k = `${f.tag}${f.classe}`;
  const v = porTexto.get(k) || { k, n: 0, menor: 99, exemplo: f.texto, telas: new Set() };
  v.n += 1;
  v.menor = Math.min(v.menor, f.fontSize);
  v.telas.add(f.tela);
  porTexto.set(k, v);
}
for (const v of [...porTexto.values()].sort((a, b) => a.menor - b.menor)) {
  console.log(
    `  ${String(v.menor).padStart(4)}px  ${String(v.n).padStart(3)}x  ${v.k.padEnd(38)} "${v.exemplo}"  [${[...v.telas].join(", ")}]`
  );
}

console.log("\n-- Alvo curto, agrupado por elemento --");
const porAlvo = new Map();
for (const a of alvosTodos) {
  const k = `${a.tag}${a.classe}`;
  const v = porAlvo.get(k) || {
    k,
    n: 0,
    menorL: 99,
    menorA: 99,
    caixa: a.ehCaixa,
    exemplo: a.texto,
    telas: new Set(),
  };
  v.n += 1;
  v.menorL = Math.min(v.menorL, a.w);
  v.menorA = Math.min(v.menorA, a.h);
  v.telas.add(a.tela);
  porAlvo.set(k, v);
}
for (const v of [...porAlvo.values()].sort(
  (a, b) => Math.min(a.menorL, a.menorA) - Math.min(b.menorL, b.menorA)
)) {
  console.log(
    `  ${String(v.menorL) + "x" + String(v.menorA)}${v.caixa ? "  [caixa]" : ""}  ${String(v.n).padStart(3)}x  ${v.k.padEnd(38)} "${v.exemplo}"  [${[...v.telas].join(", ")}]`
  );
}

const verticaisTodas = porAba.flatMap((a) => a.cortadosVerticais.map((c) => ({ ...c, tela: a.rotulo })));
const transbordosTodos = porAba.flatMap((a) => a.transbordosVerticais.map((c) => ({ ...c, tela: a.rotulo })));
if (verticaisTodas.length) {
  console.log("\n-- Corte vertical real, agrupado por elemento --");
  const porVertical = new Map();
  for (const c of verticaisTodas) {
    const k = `${c.tag}${c.classe}`;
    const v = porVertical.get(k) || { k, n: 0, altura: c.altura, exemplo: c.texto, telas: new Set() };
    v.n += 1;
    v.telas.add(c.tela);
    porVertical.set(k, v);
  }
  for (const v of porVertical.values()) {
    console.log(`  height=${String(v.altura).padEnd(8)} ${String(v.n).padStart(3)}x  ${v.k.padEnd(38)} "${v.exemplo}"  [${[...v.telas].join(", ")}]`);
  }
}
if (transbordosTodos.length) {
  console.log("\n-- Transbordo vertical visivel (nao corta; so avisa) --");
  const porTransbordo = new Map();
  for (const c of transbordosTodos) {
    const k = `${c.tag}${c.classe}`;
    const v = porTransbordo.get(k) || { k, n: 0, altura: c.altura, exemplo: c.texto, telas: new Set() };
    v.n += 1;
    v.telas.add(c.tela);
    porTransbordo.set(k, v);
  }
  for (const v of porTransbordo.values()) {
    console.log(`  height=${String(v.altura).padEnd(8)} ${String(v.n).padStart(3)}x  ${v.k.padEnd(38)} "${v.exemplo}"  [${[...v.telas].join(", ")}]`);
  }
}

const total = porAba.reduce(
  (s, a) => ({
    fontes: s.fontes + a.fontes.length,
    alvos: s.alvos + a.alvos.length,
    cortados: s.cortados + a.cortados.length,
    cortadosV: s.cortadosV + a.cortadosVerticais.length,
    transbordosV: s.transbordosV + a.transbordosVerticais.length,
    excesso: Math.max(s.excesso, a.scrollWidth - a.innerWidth),
  }),
  { fontes: 0, alvos: 0, cortados: 0, cortadosV: 0, transbordosV: 0, excesso: 0 }
);
console.log(
  `\nTOTAL: fonte<${FONTE_MINIMA}px=${total.fontes}  alvo<${ALVO_MINIMO}px=${total.alvos}  cortados=${total.cortados}  cortados-vertical=${total.cortadosV}  transbordo-vertical=${total.transbordosV}  excesso-x=${total.excesso}px  erros-console=${errosConsole.length}\n`
);

await pagina.screenshot({ path: "C:/Users/Correta Engenharia/obras-campo.png", fullPage: false });
await navegador.close();

async function page_evaluate_medicoes(pg, fonteMin, alvoMin) {
  return await pg.evaluate(
    async ({ fonteMin, alvoMin }) => {
      const visivel = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const descreve = (el) => ({
        tag: el.tagName.toLowerCase(),
        classe:
          typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
            : "",
        texto: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 34),
      });

      const app = document.querySelector(".xl-app");
      const estApp = app ? getComputedStyle(app) : null;

      // 1) texto pequeno demais para ler no sol, no celular
      const fontes = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (!visivel(el)) continue;
        if (el.closest("svg")) continue;
        const temTextoProprio = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0
        );
        if (!temTextoProprio) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < fonteMin) fontes.push({ fontSize: fs, ...descreve(el) });
      }
      fontes.sort((a, b) => a.fontSize - b.fontSize);

      // 2) alvos de toque pequenos demais para o dedo
      const seletorAlvo =
        'button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [onclick]';
      const alvos = [];
      for (const el of Array.from(document.querySelectorAll(seletorAlvo))) {
        if (!visivel(el)) continue;
        const r = el.getBoundingClientRect();
        const tipo = el.getAttribute("type");
        const ehCaixa =
          el.tagName === "INPUT" && (tipo === "checkbox" || tipo === "radio");
        // Uma caixa de selecao de 44px parece defeito e nao e o que a norma
        // pede: a WCAG 2.5.8 exige 24px. Ela e medida por outro criterio e
        // reportada a parte, para o numero de 44px nao virar ficcao.
        const limite = ehCaixa ? 24 : alvoMin;
        if (r.width >= limite && r.height >= limite) continue;
        alvos.push({
          w: Math.round(r.width),
          h: Math.round(r.height),
          ehCaixa,
          ...descreve(el),
        });
      }
      alvos.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));

      // 3) conteudo cortado: transborda e nenhum ancestral permite rolar
      const rola = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflow)) return true;
        }
        return false;
      };
      const cortados = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (!visivel(el)) continue;
        const r = el.getBoundingClientRect();
        // Conteudo fora da tela nao esta "cortado": esta numa gaveta fechada.
        if (r.right < 0 || r.left > window.innerWidth) continue;
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        const s = getComputedStyle(el);
        if (s.textOverflow === "ellipsis") continue; // reticencias = corte proposital
        if (/auto|scroll/.test(s.overflowX)) continue; // o proprio elemento rola
        if (rola(el)) continue; // algum ancestral rola: alcancavel por arrasto
        cortados.push({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          x: Math.round(r.x),
          w: Math.round(r.width),
          // Quantos pixels do elemento ficam fora da tela, sem rolagem possivel.
          foraDaTela: Math.max(0, Math.round(r.right - window.innerWidth)),
          ...descreve(el),
        });
      }

      // 3b) conteudo cortado na VERTICAL: o texto cresceu mas a caixa tem altura
      // fixa. Selos e etiquetas do app sao `height: 18px` com fonte de 8px --
      // subir a fonte sem isso passaria despercebido.
      //
      // Sao duas coisas diferentes e o relatorio nao pode confundi-las:
      //   * CORTE: a propria caixa esconde o excedente (`overflow: hidden|clip`).
      //     A informacao some da tela. E defeito.
      //   * TRANSBORDO: `overflow: visible`, o texto passa da caixa e continua
      //     legivel. Acontece com `line-height:1` (um `strong` de 20px mede 20px
      //     de caixa mas a linha pede ~23px). Feio, porem nada se perde.
      // Separar os dois evita marcar como defeito o que e so a metrica do glifo.
      const cortadosVerticais = [];
      const transbordosVerticais = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (!visivel(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right < 0 || r.left > window.innerWidth) continue;
        if (el.scrollHeight <= el.clientHeight + 1) continue;
        const s = getComputedStyle(el);
        if (/auto|scroll/.test(s.overflowY)) continue; // rola: alcancavel
        const temTextoProprio = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && (n.textContent || "").trim()
        );
        if (!temTextoProprio) continue;
        const registro = {
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          altura: s.height,
          overflowY: s.overflowY,
          ...descreve(el),
        };
        if (/hidden|clip/.test(s.overflowY)) cortadosVerticais.push(registro);
        else transbordosVerticais.push(registro);
      }

      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        appAltura: app ? Math.round(app.getBoundingClientRect().height) : -1,
        appAlturaVisivel: window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight,
        appPadTopo: estApp ? estApp.paddingTop : "?",
        appPadBase: estApp ? estApp.paddingBottom : "?",
        swControlando: !!navigator.serviceWorker?.controller,
        swRegistrado: (await navigator.serviceWorker?.getRegistrations?.())?.length > 0,
        pointerCoarse: matchMedia("(pointer: coarse)").matches,
        temTouch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
        fontes,
        alvos,
        cortados,
        cortadosVerticais,
        transbordosVerticais,
      };
    },
    { fonteMin, alvoMin }
  );
}
