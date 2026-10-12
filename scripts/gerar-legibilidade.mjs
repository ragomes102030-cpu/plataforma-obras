// Gera client/src/legibilidade-gerada.css a partir de tests/contraste/relatorio.json.
//
// Para cada LUGAR medido (nao so cada classe) que reprovou o minimo de contraste
// da WCAG 2.1, calcula a cor minima que passa em TODOS os fundos em que aquele
// lugar foi visto e escreve uma regra. Preserva matiz e saturacao: so mexe na
// luminosidade, entao cinza continua cinza e azul continua azul.
//
// O seletor e o caminho estrutural medido (ex.: .eap-arvore > .eap-no > .eap-rownum),
// e nao apenas a classe. Motivo: uma classe utilitaria como .mono aparece em
// varias telas e em fundos diferentes; uma regra por classe teria efeito
// colateral fora do que foi medido. O caminho limita o alcance ao lugar certo.
//
// Recusa gerar quando a troca seria arriscada:
//  - mesmo lugar com cores diferentes (uma regra so forcaria uma cor para todos);
//  - barra lateral, cujo tema e escrito a mao;
//  - seletor sem nenhuma classe, que atingiria telas demais.
//
// Uso: node scripts/gerar-legibilidade.mjs [leitura.json] [--seco]
//
// A leitura precisa ser a do ANTES, ou seja, medida com esta folha desligada.
// Passo a passo para refazer do zero:
//   1. comentar os imports de barra-lateral.css e legibilidade-gerada.css em main.tsx
//   2. npm run build
//   3. node scripts/auditar-contraste.mjs http://localhost:4599 tests/contraste/antes.json
//   4. descomentar os imports e npm run build
//   5. node scripts/gerar-legibilidade.mjs tests/contraste/antes.json
//   6. node scripts/auditar-contraste.mjs http://localhost:4599 tests/contraste/depois.json
import { readFileSync, writeFileSync } from "fs";
import { ajustar, paraRgb, paraHex, razao, paraHsl } from "./contraste-lib.mjs";

const SECO = process.argv.includes("--seco");
const ENTRADA = process.argv.find(a => a.endsWith(".json")) || "tests/contraste/relatorio.json";
const ALVO = 4.6; // minimo 4,5 da norma com uma folga para arredondamento
const dados = JSON.parse(readFileSync(ENTRADA, "utf8"));

// Agrupa por lugar (caminho) + cor, porque o caminho e o que vira seletor.
const porLugar = new Map();
for (const t of dados) {
  for (const l of t.leituras) {
    const chave = l.caminho;
    if (!porLugar.has(chave)) porLugar.set(chave, { caminho: chave, classe: l.chave, porCor: new Map() });
    const lugar = porLugar.get(chave);
    if (!lugar.porCor.has(l.cor)) lugar.porCor.set(l.cor, []);
    lugar.porCor.get(l.cor).push({ ...l, tela: t.tela });
  }
}

// Monta o seletor a partir do caminho, guardando o realce de estado.
//
// CUIDADO APRENDIDO AQUI: quando existe uma variante irma (`button.ativo` ao
// lado de `button`), a regra da base NAO pode achatá-la. Aconteceu exatamente
// isso: a regra da base (`button` -> #607285) pegou o botao ativo, que passava
// com 10,62:1, e o derrubou para 4,43:1 -- ou seja, corrigir uma coisa criou
// outra. A defesa e `:not()` com as classes que aparecem nas variantes irmas do
// mesmo pai, tiradas da propria medicao (nao de uma lista de nomes supostos).
function montarSeletor(caminho, estados, variantesDoPai) {
  const niveis = caminho.split(" > ");
  const ultimo = niveis.length - 1;
  const classesDe = nivel => (nivel.match(/\.([\w-]+)/g) || []).map(c => c.slice(1));
  const minhas = new Set(classesDe(niveis[ultimo]));
  for (const classe of variantesDoPai) {
    if (minhas.has(classe)) continue;
    if (!niveis[ultimo].includes(`:not(.${classe})`)) niveis[ultimo] += `:not(.${classe})`;
  }
  for (const e of estados) {
    const [onde, classe] = e.split(":");
    const i = onde === "eu" ? ultimo : ultimo - 1;
    if (i < 0) continue;
    if (classesDe(niveis[i]).includes(classe)) continue;
    if (!niveis[i].includes(`:not(.${classe})`)) niveis[i] += `:not(.${classe})`;
  }
  return niveis.join(" > ");
}

const regras = [], manuais = [], semFalha = [];
const lugares = [...porLugar.values()];

// Variantes irmas: mesmo pai, classes extras no ultimo nivel. Servem para o
// `:not()` que impede a regra da base de achatar a variante.
const paiDe = caminho => caminho.split(" > ").slice(0, -1).join(" > ");
const classesDe = nivel => (nivel.match(/\.([\w-]+)/g) || []).map(c => c.slice(1));
const variantesPorPai = new Map();
for (const lugar of lugares) {
  const pai = paiDe(lugar.caminho);
  const classes = classesDe(lugar.caminho.split(" > ").pop());
  if (!variantesPorPai.has(pai)) variantesPorPai.set(pai, new Set());
  if (classes.length) for (const c of classes) variantesPorPai.get(pai).add(c);
}

// Primeiro passo: cada cor antiga vira UMA cor nova, calculada contra todos os
// fundos em que aquela cor aparece. Sem isso, o mesmo cinza virava duas cores
// diferentes em telas diferentes so porque o fundo era outro -- quebra a paleta.
const porCor = new Map();
for (const lugar of lugares) {
  for (const [cor, lista] of lugar.porCor) {
    if (!porCor.has(cor)) porCor.set(cor, { cor, lugares: new Set(), fundos: new Set(), falhas: 0, leituras: [] });
    const g = porCor.get(cor);
    g.lugares.add(lugar.caminho);
    lista.forEach(l => { g.fundos.add(l.fundo); g.leituras.push({ ...l, caminho: lugar.caminho }); });
    g.falhas += lista.filter(l => !l.passou).length;
  }
}
const corNova = new Map(), corSemSaida = [];
for (const [cor, g] of porCor) {
  if (!g.falhas) continue;
  const fundos = [...g.fundos].map(paraRgb);
  const minimo = Math.max(...g.leituras.filter(l => !l.passou).map(l => l.minimo));
  const ajuste = ajustar(cor, fundos, Math.max(ALVO, minimo));
  if (ajuste) corNova.set(cor, { hex: ajuste.hex, fundos, minimo, direcao: ajuste.fundo, lugares: g.lugares.size, falhas: g.falhas });
  else corSemSaida.push({ cor, lugares: g.lugares.size, fundos: [...g.fundos].join(" / ") });
}

for (const lugar of porLugar.values()) {
  const todas = [...lugar.porCor.values()].flat();
  const falhas = todas.filter(l => !l.passou);
  if (!falhas.length) { semFalha.push(lugar.caminho); continue; }

  if (/xl-pasta-sidebar|xl-sidebar|xl-lixeira|xl-menu-mobile/.test(lugar.caminho)) {
    manuais.push({ ...lugar, motivo: "barra lateral (tema escrito a mao)", casos: falhas.length });
    continue;
  }
  if (!/\./.test(lugar.caminho)) {
    manuais.push({ ...lugar, motivo: "caminho sem classe", casos: falhas.length });
    continue;
  }

  // A cor nova vem do mapa por cor. Se a cor nao teve saida unica (aparece em
  // fundo claro e em fundo escuro), cai para o calculo so deste lugar.
  const cores = [...lugar.porCor.keys()];
  let hex, direcao, fundos, minimo, unificada;
  const comSaida = cores.filter(c => corNova.has(c));
  if (comSaida.length === 1 && cores.length === 1) {
    const n = corNova.get(comSaida[0]);
    hex = n.hex; direcao = n.direcao; fundos = n.fundos; minimo = n.minimo; unificada = n.lugares;
  } else if (comSaida.length === 1) {
    const n = corNova.get(comSaida[0]);
    hex = n.hex; direcao = n.direcao; fundos = n.fundos; minimo = n.minimo; unificada = n.lugares;
  } else {
    const locais = [...new Set(todas.map(l => l.fundo))].map(paraRgb);
    if (locais.some(f => !f)) { manuais.push({ ...lugar, motivo: "fundo ilegivel", casos: falhas.length }); continue; }
    const a = ajustar(cores[0], locais, Math.max(ALVO, Math.max(...falhas.map(l => l.minimo))));
    if (!a) { manuais.push({ ...lugar, motivo: "nem preto nem branco atingem o minimo", casos: falhas.length }); continue; }
    hex = a.hex; direcao = a.fundo; fundos = locais; minimo = Math.max(...falhas.map(l => l.minimo)); unificada = 1;
  }

  const estados = [...new Set(todas.flatMap(l => l.estado || []))];
  const guardar = [...(variantesPorPai.get(paiDe(lugar.caminho)) || [])];
  const antes = Math.min(...falhas.map(l => l.razao));
  const depois = Math.min(...fundos.map(f => razao(paraRgb(hex), f)));
  regras.push({
    seletor: montarSeletor(lugar.caminho, estados, guardar),
    caminho: lugar.caminho,
    guardar,
    classe: lugar.classe,
    corOriginal: cores[0],
    hex,
    direcao,
    antes: Math.round(antes * 100) / 100,
    depois: Math.round(depois * 100) / 100,
    casos: falhas.length,
    telas: [...new Set(falhas.map(l => l.tela))].length,
    fontes: [...new Set(falhas.map(l => l.fonte))].sort(),
    exemplo: falhas[0].texto,
    estados,
    unificada,
    matiz: Math.round(paraHsl(paraRgb(cores[0])).h),
    sat: Math.round(paraHsl(paraRgb(cores[0])).s * 100),
  });
}

regras.sort((a, b) => a.antes - b.antes || a.seletor.localeCompare(b.seletor));

// Junta regras iguais (mesmo seletor e mesma cor) que vieram de telas diferentes.
const unicas = new Map();
for (const r of regras) {
  const k = r.seletor;
  if (!unicas.has(k)) { unicas.set(k, r); continue; }
  const g = unicas.get(k);
  g.casos += r.casos;
  g.telas = Math.max(g.telas, r.telas);
  g.antes = Math.min(g.antes, r.antes);
  g.fontes = [...new Set([...g.fontes, ...r.fontes])].sort();
}
const lista = [...unicas.values()].sort((a, b) => a.antes - b.antes || a.seletor.localeCompare(b.seletor));

const linhas = [];
linhas.push("/*");
linhas.push(" * legibilidade-gerada.css -- ARQUIVO GERADO. Nao editar a mao.");
linhas.push(" *");
linhas.push(" * Regerar: node scripts/gerar-legibilidade.mjs tests/contraste/antes.json");
linhas.push(" * Medir:   node scripts/auditar-contraste.mjs");
linhas.push(" *");
linhas.push(" * Cada regra nasce de uma medicao de contraste: o lugar reprovava o minimo da");
linhas.push(" * WCAG 2.1 (4,5:1 para texto normal, 3:1 para texto grande) e a cor foi");
linhas.push(" * ajustada so na luminosidade ate passar em TODOS os fundos em que aquele");
linhas.push(" * lugar foi visto. O comentario traz a cor antiga, a nova, a pior razao antes");
linhas.push(" * e depois, quantos casos, em quantas telas, com que tamanhos de fonte.");
linhas.push(" *");
linhas.push(" * O seletor e o caminho estrutural medido, nao apenas a classe, para nao");
linhas.push(" * atingir lugares que nao foram medidos. O :not() de estado preserva o realce");
linhas.push(" * de item ativo, e o :not(:hover) preserva o realce de interacao.");
linhas.push(" */");
linhas.push("");
linhas.push(`/* regras geradas: ${lista.length} */`);
linhas.push("");
for (const r of lista) {
  linhas.push(`/* ${r.classe}${r.unificada > 1 ? `   (mesma cor em ${r.unificada} lugares -- uma cor nova so para todos)` : ""}`);
  linhas.push(`   ${r.corOriginal} -> ${r.hex}  (${r.direcao}; matiz ${r.matiz}o, saturacao ${r.sat}%, so a luz mudou)`);
  linhas.push(`   contraste: ${r.antes}:1 -> ${r.depois}:1   |   ${r.casos} casos em ${r.telas} telas`);
  linhas.push(`   fontes: ${r.fontes.join(", ")}   |   ex.: "${r.exemplo}"${r.estados.length ? `   |   estado preservado: ${r.estados.join(", ")}` : ""} */`);
  linhas.push(`html body ${r.seletor}:not(:hover):not(:focus-visible) { color: ${r.hex} !important; }`);
  linhas.push("");
}

const conteudo = linhas.join("\n");
if (!SECO) writeFileSync("client/src/legibilidade-gerada.css", conteudo, "utf8");

console.log(`lugares medidos: ${porLugar.size} | sem falha: ${semFalha.length} | regras: ${lista.length} | para a mao: ${manuais.length}`);
console.log(`cores antigas que reprovaram: ${[...porCor.values()].filter(g => g.falhas).length} | com cor nova unica: ${corNova.size} | sem saida unica: ${corSemSaida.length}`);
if (corSemSaida.length) {
  console.log(`\n--- cores sem cor nova unica (fundo claro e escuro na mesma cor) ---`);
  for (const c of corSemSaida) console.log(`  ${c.cor} em ${c.lugares} lugares | fundos: ${c.fundos}`);
}
console.log(`\n--- regras (${lista.length}) ---`);
for (const r of lista) {
  console.log(`${String(r.antes).padStart(5)}:1 -> ${String(r.depois).padStart(5)}:1  ${r.corOriginal} -> ${r.hex}  ${r.seletor}`);
}
console.log(`\n--- para a mao (${manuais.length}) ---`);
for (const m of manuais) console.log(`  [${m.casos} casos] ${m.motivo}\n      ${m.caminho}`);
if (!SECO) console.log(`\nescrito: client/src/legibilidade-gerada.css (${conteudo.length} bytes)`);
