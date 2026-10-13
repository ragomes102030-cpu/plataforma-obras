// Piso tipografico de DESKTOP: sobe para 12,5px as declaracoes de `font-size`
// que o app define abaixo disso na raiz do CSS (sem @media).
//
//   node gerar-tipografia-desktop.mjs           -> so o resumo (nao escreve)
//   node gerar-tipografia-desktop.mjs --gerar   -> escreve client/src/tipografia-desktop.css
//
// E o irmao de `gerar-tipografia-campo.mjs`. A camada de campo cobre
// `max-width: 900px e pointer: coarse` (celular); esta cobre `min-width: 901px`
// (mesa). As duas usam o mesmo piso, o token `--texto-min` de theme-tokens.css.
//
// Por que so a raiz (sem @media): o app declara 777 tamanhos de fonte fora de
// qualquer @media e apenas 18 dentro deles -- e esses 18 estao todos em faixas
// estreitas (<= 620px), que nao valem no desktop. Ou seja, no desktop quem manda
// e a raiz. Medido: nenhum seletor pequeno na raiz fica >= piso dentro de algum
// @media (0 de 612), entao um override de raiz nao encolhe texto em faixa
// nenhuma.
//
// Por que `min-width: 901px` em vez de regra solta: os @media do app que contem
// layout (1100px, 1050px, 980px) ficam de fora do escopo, mesmo sem declarar
// fonte. Assim esta camada e a camada de campo nunca se cruzam: 900 / 901.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { listarFontes, emPx } from "./css-fontes-lib.mjs";

const RAIZ = "C:/Users/Correta Engenharia/po-develop/client/src";
const PISO = 12.5;
// A partir daqui e "mesa". O app nao declara NENHUM tamanho de fonte em @media
// acima de 620px -- os 18 que existem estao em 600, 620, 560 e 500. Entao de
// 621px para cima so a raiz governa, e subir a raiz nao disputa com ninguem.
// 621 e nao 901 de proposito: um portatil do Windows a 150% de escala entrega
// ~853px de largura CSS, que e mesa e ficaria de fora.
const PORTAO = 621;
const GERAR = process.argv.includes("--gerar");
const DESTINO = path.join(RAIZ, "tipografia-desktop.css");

// Quebra lista de seletores respeitando parenteses: `.a, :is(.b, .c)` tem duas
// partes, nao tres.
function dividir(seletor) {
  const partes = [];
  let nivel = 0;
  let atual = "";
  for (const c of seletor) {
    if (c === "(") nivel += 1;
    if (c === ")") nivel -= 1;
    if (c === "," && nivel === 0) {
      partes.push(atual.trim());
      atual = "";
      continue;
    }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes.filter(Boolean);
}

const { declaracoes } = listarFontes(RAIZ);
const base = declaracoes.filter((d) => !d.media);

// Decide por SELETOR INDIVIDUAL, e vale a ultima declaracao do bundle. Julgar
// pela regra inteira erraria `.a, .b { 9px }` seguido de `.a { 14px }`: `.a` ja
// passou do piso e `.b` nao.
const ultimo = new Map(); // seletor -> { valor, importante }
for (const d of base) {
  for (const s of dividir(d.seletor)) ultimo.set(s, { valor: d.valor, importante: d.importante });
}

const candidatos = []; // abaixo do piso na raiz
const relativos = []; // rem/em/%/var: o gerador nao decide
for (const [seletor, info] of ultimo) {
  const v = emPx(info.valor);
  if (v === null) relativos.push({ seletor, valor: info.valor });
  else if (v < PISO) candidatos.push({ seletor, valor: v, valorTxt: info.valor, importante: info.importante });
}

// Portao de seguranca: para cada candidato, existe algum @media em que ele fique
// >= piso? Se existisse, a faixa estreita ficaria de fora pelo `min-width: 901px`
// de qualquer forma, mas registrar mantem a premissa auditavel.
const porSeletorTodos = new Map();
for (const d of declaracoes) {
  for (const s of dividir(d.seletor)) {
    if (!porSeletorTodos.has(s)) porSeletorTodos.set(s, []);
    porSeletorTodos.get(s).push(d);
  }
}
const emRisco = candidatos.filter((c) =>
  (porSeletorTodos.get(c.seletor) || []).some((d) => {
    const v = emPx(d.valor);
    return v !== null && v >= PISO && d.media;
  })
);

const grupos = new Map(); // valor -> Set(seletor)
for (const c of candidatos) {
  const chave = `${c.valorTxt}|||${c.importante}`;
  if (!grupos.has(chave)) grupos.set(chave, { valorTxt: c.valorTxt, valor: c.valor, importante: c.importante, seletores: new Set() });
  grupos.get(chave).seletores.add(c.seletor);
}

const ordenados = [...grupos.values()].sort((a, b) => a.valor - b.valor);

console.log(`\nDeclaracoes de tamanho: ${declaracoes.length}`);
console.log(`  na raiz (sem @media)      : ${base.length}`);
console.log(`  dentro de @media          : ${declaracoes.length - base.length}`);
console.log(`\nSeletores distintos na raiz: ${ultimo.size}`);
console.log(`  abaixo de ${PISO}px         : ${candidatos.length}  (serao sobrescritos)`);
console.log(`  ja no piso ou acima       : ${ultimo.size - candidatos.length - relativos.length}`);
console.log(`  sem numero (rem/em/%/var) : ${relativos.length}`);
console.log(`  grupos a emitir           : ${ordenados.length}`);
if (emRisco.length) {
  console.log(`\n  ATENCAO: ${emRisco.length} candidatos ficam >= piso dentro de algum @media:`);
  for (const c of emRisco.slice(0, 20)) console.log(`    ${c.seletor}  raiz=${c.valorTxt}`);
} else {
  console.log("\n  Portao anti-encolhimento: 0 candidatos com valor >= piso em outro contexto.");
}

console.log("\nPor valor de origem:");
for (const g of ordenados) console.log(`  ${g.valorTxt.padEnd(7)} ${String(g.seletores.size).padStart(4)} seletores${g.importante ? "  (!important)" : ""}`);

if (relativos.length) {
  console.log("\nSem numero de pixels na raiz (tratados a mao, quando abaixo do piso):");
  for (const r of relativos.slice(0, 40)) console.log(`  ${r.seletor.slice(0, 62).padEnd(64)} ${r.valor}`);
}

if (!GERAR) {
  console.log("\n(sem --gerar: nada foi escrito)\n");
  process.exit(0);
}

const total = candidatos.length;
const linhas = [];
linhas.push("/* GERADO por scripts/gerar-tipografia-desktop.mjs -- nao editar a mao.");
linhas.push(" *");
linhas.push(" * Piso tipografico de desktop. Ate aqui o app ia de 7px a 12px em rotulos de");
linhas.push(" * tabela, codigos de linha e etiquetas: medido em 15 telas a 1440x900, 2.441");
linhas.push(" * textos ficavam abaixo de 12,5px, sendo 88 a 7px (.eap-rownum,");
linhas.push(" * .eap-grupo-label) e 306 a 8px (.xl-sidebar-label, .arquimedes-kicker,");
linhas.push(" * .scopo-tag, .pl-atividade-tag). Nao era hierarquia, era ruido: 7px, 7,5px e");
linhas.push(" * 9,8px nao sao degraus de escala nenhuma.");
linhas.push(" *");
linhas.push(" * Como funciona: para cada seletor que declara abaixo do piso NA RAIZ do CSS");
linhas.push(" * (sem @media), repete o mesmo seletor aqui. Especificidade igual, declaracao");
linhas.push(" * depois -> a ultima vence. Nunca encolhe: so e tocado o seletor cuja ultima");
linhas.push(" * declaracao de raiz ja estava abaixo do piso, e um numero grande declarado");
linhas.push(" * por outro seletor nao e alcancado. O `!important` e espelhado, nunca forcado.");
linhas.push(" *");
linhas.push(" * Escopo `min-width: 621px`: de 621px para cima o app so declara tamanho na");
linhas.push(" * raiz, entao subir a raiz nao disputa com @media nenhum. A camada de campo");
linhas.push(" * (campo-tipografia.css) cobre ate 900px com o dedo, e as duas usam o mesmo");
linhas.push(" * piso (`--texto-min`, em theme-tokens.css). Nenhuma das duas pisa na outra.");
linhas.push(" *");
linhas.push(" * O corte em 621 e nao em 901 de proposito: um portatil do Windows a 150% de");
linhas.push(" * escala entrega ~853px de largura CSS -- e mesa, e ficaria de fora de 901.");
linhas.push(" *");
linhas.push(` * ${total} seletores em ${ordenados.length} blocos.`);
linhas.push(" */");
linhas.push("");
linhas.push(`@media (min-width: ${PORTAO}px) {`);
linhas.push("  /* A EAP inteira herda o tamanho da linha desta variavel: 11,5px no normal,");
linhas.push("     10,5px no compacto, 12px no confortavel (eap.css) -- as tres abaixo do");
linhas.push("     piso. Subir a variavel, e nao cada `.eap-linha`, mantem as densidades");
linhas.push("     coerentes entre si. A linha tem de 28 a 38px de altura, entao 12,5px cabe. */");
linhas.push("  html body :is(.eap-densidade-compacta, .eap-densidade-normal, .eap-densidade-confortavel) {");
linhas.push("    --eap-font: var(--texto-min);");
linhas.push("  }");
linhas.push("");
linhas.push("  /* Declarados em rem: 0.75rem = 12px, logo abaixo do piso. `max()` aqui so");
linhas.push("     pode aumentar, entao a intencao original fica preservada. Os de 0.8rem e");
linhas.push("     0.85rem (12,8px e 13,6px) ja passam do piso e nao entram. */");
linhas.push("  html body .gantt-help,");
linhas.push("  html body .gantt-detail-row,");
linhas.push("  html body .budget-analysis-branch small {");
linhas.push("    font-size: max(var(--texto-min), 0.75rem);");
linhas.push("  }");
linhas.push("");

for (const g of ordenados) {
  const seletores = [...g.seletores].sort((a, b) => a.localeCompare(b)).join(",\n  ");
  const declaracao = `font-size: var(--texto-min)${g.importante ? " !important" : ""};`;
  linhas.push(`  /* o app declarava ${g.valorTxt} nestes ${g.seletores.size} seletores */`);
  linhas.push(`  ${seletores} {`);
  linhas.push(`    ${declaracao}`);
  linhas.push("  }");
  linhas.push("");
}

linhas.push("}");
linhas.push("");

writeFileSync(DESTINO, linhas.join("\n"), "utf8");
console.log(`\nEscrito: ${DESTINO}  (${total} seletores, ${linhas.length} linhas)\n`);
