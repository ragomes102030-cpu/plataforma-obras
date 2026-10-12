// Audita contraste de texto (WCAG 2.1) nas 15 telas, no computador e no celular.
//
// Le a cor da letra e a cor de fundo efetiva (compondo fundos translucidos) de
// cada texto visivel, calcula a razao de contraste e compara com o minimo:
// texto normal 4,5:1; texto grande (>=24px, ou >=18,66px em negrito) 3:1.
// Elemento desabilitado e isento pela propria norma.
//
// Grava TODAS as leituras em tests/contraste/relatorio.json (nao so as
// reprovadas), porque uma classe pode aparecer em varios fundos e a correcao de
// cor precisa valer para todos eles.
//
// Uso: node scripts/auditar-contraste.mjs [url] [arquivo-de-saida]
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const URL_BASE = process.argv[2] || "http://localhost:4599";
const ARQUIVO = process.argv[3] || "tests/contraste/relatorio.json";
const SAIDA = "tests/contraste";
const SESSAO = readFileSync("C:\\Users\\Correta Engenharia\\obras-sessao.txt", "utf8").trim();

const TELAS = [
  "dashboard", "escopo", "eap", "atividades", "dependencias", "cpm", "baseline",
  "gantt", "linha-balanco", "producao", "documentos", "suprimentos", "financeiro",
  "riscos", "curva-s",
];

const ROTINA = () => {
  const paraRgb = t => {
    const m = String(t).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const sobre = (frente, fundo) => ({
    r: frente.r * frente.a + fundo.r * (1 - frente.a),
    g: frente.g * frente.a + fundo.g * (1 - frente.a),
    b: frente.b * frente.a + fundo.b * (1 - frente.a),
    a: 1,
  });
  const canal = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const luz = c => 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
  const razao = (a, b) => {
    const l1 = luz(a), l2 = luz(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const fundoEfetivo = el => {
    const camadas = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return { indefinido: cs.backgroundImage.slice(0, 40) };
      const c = paraRgb(cs.backgroundColor);
      if (c && c.a > 0) { camadas.push(c); if (c.a >= 0.999) break; }
      n = n.parentElement;
    }
    if (!camadas.length) return { r: 255, g: 255, b: 255, a: 1 };
    let base = camadas.pop();
    if (base.a < 0.999) base = sobre(base, { r: 255, g: 255, b: 255, a: 1 });
    while (camadas.length) base = sobre(camadas.pop(), base);
    return base;
  };

  const classes = el => (typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean) : []);
  // A chave agrupa o mesmo defeito em telas diferentes. Quando o proprio
  // elemento nao tem classe, usa o pai como ancora.
  const chave = el => {
    const meu = classes(el);
    if (meu.length) return "." + meu.join(".");
    const pai = el.parentElement;
    const doc = pai ? classes(pai) : [];
    if (doc.length) return `.${doc.join(".")} > ${el.tagName.toLowerCase()}`;
    return el.tagName.toLowerCase();
  };
  const caminho = el => {
    const partes = [];
    let n = el;
    for (let i = 0; i < 4 && n && n.tagName !== "BODY"; i++) {
      let p = n.tagName.toLowerCase();
      const c = classes(n);
      if (c.length) p += "." + c.slice(0, 3).join(".");
      partes.unshift(p);
      n = n.parentElement;
    }
    return partes.join(" > ");
  };
  // Classe de estado no proprio elemento ou no pai direto: mudar a cor aqui
  // mataria o realce do item ativo, entao quem consome precisa saber.
  const estado = el => {
    const re = /(ativa|ativo|active|selecionad|expand|aberto|atual|corrente|vencedor|marcad)/i;
    const achados = [];
    for (const [i, n] of [el, el.parentElement].entries()) {
      if (!n) continue;
      for (const c of classes(n)) if (re.test(c)) achados.push(`${i === 0 ? "eu" : "pai"}:${c}`);
    }
    return achados;
  };

  const leituras = [], indefinidos = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    if (el.childElementCount > 0) continue;
    const texto = (el.textContent || "").trim();
    if (!texto) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (el.closest("[disabled]") || el.disabled) continue;
    const fundo = fundoEfetivo(el);
    if (fundo.indefinido) { indefinidos.push(`${caminho(el)} fundo=${fundo.indefinido}`); continue; }
    const frente = paraRgb(cs.color);
    if (!frente) continue;
    const cor = frente.a < 0.999 ? sobre(frente, fundo) : frente;
    const tamanho = Math.round(parseFloat(cs.fontSize) * 100) / 100;
    const peso = Number(cs.fontWeight) || 400;
    const grande = tamanho >= 24 || (tamanho >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    const r_ = razao(cor, fundo);
    leituras.push({
      chave: chave(el),
      caminho: caminho(el),
      texto: texto.slice(0, 30),
      cor: `rgb(${Math.round(cor.r)}, ${Math.round(cor.g)}, ${Math.round(cor.b)})`,
      fundo: `rgb(${Math.round(fundo.r)}, ${Math.round(fundo.g)}, ${Math.round(fundo.b)})`,
      fonte: `${peso} ${tamanho}px`,
      razao: Math.round(r_ * 100) / 100,
      minimo,
      passou: r_ >= minimo,
      estado: estado(el),
    });
  }
  return { leituras, indefinidos };
};

mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ channel: "chrome", headless: true });

async function abrir(largura, altura) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura }, hasTouch: largura < 700, isMobile: largura < 700, deviceScaleFactor: 1,
  });
  await contexto.addCookies([{ name: "app_session_id", value: SESSAO, domain: "localhost", path: "/", httpOnly: true, secure: true }]);
  const pagina = await contexto.newPage();
  await pagina.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector(".xl-app", { timeout: 60000 });
  await pagina.waitForTimeout(2500);
  return { contexto, pagina };
}

const todas = [];
for (const [nome, largura, altura] of [["praca", 1440, 900], ["campo", 390, 844]]) {
  const { contexto, pagina } = await abrir(largura, altura);
  for (let i = 0; i < TELAS.length; i++) {
    if (largura < 700) {
      const abridor = pagina.locator(".xl-menu-mobile").first();
      if (await abridor.count()) { await abridor.click(); await pagina.waitForTimeout(350); }
    }
    const item = pagina.locator(".xl-sidebar-item").nth(i);
    if (!(await item.count())) continue;
    await item.click();
    await pagina.waitForTimeout(1500);
    const r = await pagina.evaluate(ROTINA);
    const falhas = r.leituras.filter(l => !l.passou);
    todas.push({ tela: `${nome}/${TELAS[i]}`, avaliados: r.leituras.length, falhas: falhas.length, indefinidos: r.indefinidos.length, leituras: r.leituras, lugaresSemFundo: r.indefinidos });
    console.log(`${nome}/${TELAS[i]}: avaliados=${r.leituras.length} reprovados=${falhas.length} fundo-indefinido=${r.indefinidos.length}`);
  }
  await contexto.close();
}

writeFileSync(ARQUIVO, JSON.stringify(todas, null, 1), "utf8");
const total = todas.reduce((s, t) => s + t.avaliados, 0);
const reprovados = todas.reduce((s, t) => s + t.falhas, 0);
console.log(`\nresumo: ${reprovados} textos reprovados de ${total} avaliados (${(100 * reprovados / total).toFixed(1)}%)`);
await navegador.close();
