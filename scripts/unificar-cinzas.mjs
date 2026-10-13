// Unifica, na origem, as cores de texto que reprovam contraste.
//
// Por que na origem e nao numa folha de regras: o defeito e o mesmo valor de
// cinza repetido em varios componentes. Corrigir por lugar exige ter medido
// aquele lugar -- e lugar cujo conteudo depende dos dados (estado vazio de obra
// em planejamento, por exemplo) nao aparece em toda medicao. Corrigir o valor na
// folha de origem vale para todo mundo, medido ou nao.
//
// A trava: uma cor pode ser usada como texto sobre fundo claro E sobre fundo
// escuro. Escurecer para o fundo claro a destruiria no fundo escuro. Entao a
// troca so acontece quando NENHUMA leitura daquela cor tem fundo escuro. As
// outras ficam de fora e sao resolvidas por regra de lugar.
//
// So mexe em `color:` (nao em background-, border- ou outline-color).
//
// Uso: node scripts/unificar-cinzas.mjs leitura.json [...] [--aplicar]
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { ajustar, paraRgb, paraHex, razao, luz } from "./contraste-lib.mjs";

const ALVO = 4.6;
const APLICAR = process.argv.includes("--aplicar");
const ARQUIVOS = process.argv.slice(2).filter(a => a.endsWith(".json"));
if (!ARQUIVOS.length) ARQUIVOS.push("tests/contraste/antes.json");
const leituras = ARQUIVOS.flatMap(a => JSON.parse(readFileSync(a, "utf8"))).flatMap(t => t.leituras.map(l => ({ ...l, tela: t.tela })));

// Agrupa por cor: fundos em que aparece, quantas reprovacoes.
const porCor = new Map();
for (const l of leituras) {
  if (!porCor.has(l.cor)) porCor.set(l.cor, { fundos: new Set(), falhas: 0, minimo: 0, lugares: new Set() });
  const g = porCor.get(l.cor);
  g.fundos.add(l.fundo);
  g.lugares.add(l.caminho);
  if (!l.passou) { g.falhas++; g.minimo = Math.max(g.minimo, l.minimo); }
}

const plano = [], deixadas = [];
for (const [cor, g] of porCor) {
  if (!g.falhas) continue;
  const fundos = [...g.fundos].map(paraRgb);
  const escuro = fundos.some(f => luz(f) < 0.18);
  if (escuro) { deixadas.push({ cor, motivo: "aparece tambem sobre fundo escuro", fundos: [...g.fundos].join(" / ") }); continue; }
  const novo = ajustar(cor, fundos, Math.max(ALVO, g.minimo));
  if (!novo) { deixadas.push({ cor, motivo: "nem preto nem branco atingem o minimo", fundos: [...g.fundos].join(" / ") }); continue; }
  plano.push({ cor, hex: paraHex(paraRgb(cor)), novo: novo.hex, antes: Math.min(...fundos.map(f => razao(paraRgb(cor), f))), depois: Math.min(...fundos.map(f => razao(paraRgb(novo.hex), f))), lugares: g.lugares.size, falhas: g.falhas });
}
plano.sort((a, b) => a.antes - b.antes);

// Ocorrencias em `color:` nas folhas do app.
const PASTA = "client/src";
const folhas = readdirSync(PASTA).filter(f => f.endsWith(".css")).map(f => join(PASTA, f));
const ocorrencias = new Map(); // arquivo -> [{linha, texto, hex}]
for (const arq of folhas) {
  const linhas = readFileSync(arq, "utf8").split(/\r?\n/);
  linhas.forEach((texto, i) => {
    for (const p of plano) {
      // (?<![-\w]) evita casar background-color / border-color / outline-color.
      const re = new RegExp(`(?<![-\\w])color\\s*:\\s*${p.hex}\\b`, "gi");
      if (!re.test(texto)) continue;
      if (!ocorrencias.has(arq)) ocorrencias.set(arq, []);
      ocorrencias.get(arq).push({ linha: i + 1, texto: texto.trim(), de: p.hex, para: p.novo, cor: p.cor });
    }
  });
}

console.log(`leituras: ${ARQUIVOS.join(" + ")} | cores que reprovam: ${[...porCor.values()].filter(g => g.falhas).length}`);
console.log(`\n--- corrigiveis na origem (${plano.length} cores) ---`);
for (const p of plano) {
  const n = [...ocorrencias.values()].flat().filter(o => o.de === p.hex).length;
  console.log(`${String(p.antes).padStart(5)}:1 -> ${String(p.depois).padStart(5)}:1   ${p.hex} -> ${p.novo}   ${p.lugares} lugares, ${p.falhas} reprovacoes, ${n} declaracoes`);
}
console.log(`\n--- deixadas de fora (${deixadas.length} cores) ---`);
for (const d of deixadas) console.log(`  ${d.cor}  ${d.motivo}\n      fundos: ${d.fundos}`);

console.log(`\n--- declaracoes que seriam trocadas ---`);
for (const [arq, lista] of ocorrencias) {
  console.log(`\n${arq}: ${lista.length}`);
  for (const o of lista.slice(0, 12)) console.log(`   linha ${o.linha}: ${o.texto.slice(0, 130)}`);
  if (lista.length > 12) console.log(`   (+${lista.length - 12})`);
}

if (!APLICAR) {
  console.log(`\n(simulacao -- nada foi escrito. Rode com --aplicar para valer)`);
} else {
  let trocas = 0;
  for (const arq of folhas) {
    let conteudo = readFileSync(arq, "utf8");
    for (const p of plano) {
      const re = new RegExp(`((?<![-\\w])color\\s*:\\s*)${p.hex}\\b`, "gi");
      const antes = conteudo;
      conteudo = conteudo.replace(re, `$1${p.novo}`);
      if (conteudo !== antes) trocas += (antes.match(re) || []).length;
    }
    if (conteudo !== readFileSync(arq, "utf8")) writeFileSync(arq, conteudo, "utf8");
  }
  console.log(`\naplicado: ${trocas} declaracoes trocadas em ${folhas.length} folhas`);
}
