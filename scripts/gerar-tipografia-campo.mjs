// Le os CSS do app e separa as declaracoes de `font-size` menores que o piso
// de campo, para gerar overrides que SO AUMENTAM texto.
//
//   node gerar-tipografia-campo.mjs            -> so o resumo (nao escreve nada)
//   node gerar-tipografia-campo.mjs --gerar    -> escreve client/src/campo-tipografia.css
//
// Por que gerar em vez de usar uma regra universal: uma regra universal de
// `font-size` aplasta a escala tipografica. Em `font-size`, `1em` vale o
// tamanho do PAI, entao `max(12,5px, 1em)` ENCOLHE todo texto que seja maior
// que o pai -- medido: os titulos de pagina h1 (21px) e h2 (20px) caiam para
// 16px. Aqui o override usa o MESMO seletor da regra original, na mesma
// condicao de media, e e declarado depois: especificidade igual, ultima vence.
// Um numero grande declarado por outro seletor nao e alcancado.
//
// A leitura do CSS e a extracao do tamanho moram em `css-fontes-lib.mjs`,
// compartilhadas com o gerador da camada de desktop.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { listarFontes, agruparPorContexto, normalizarMediaCampo, emPx } from "./css-fontes-lib.mjs";

const RAIZ = "C:/Users/Correta Engenharia/po-develop/client/src";
const PISO = 12.5;
const GERAR = process.argv.includes("--gerar");
const DESTINO = path.join(RAIZ, "campo-tipografia.css");

// --- 1. le os arquivos na ordem do bundle --------------------------------
const { arquivos, declaracoes } = listarFontes(RAIZ);

// --- 2. classifica ----------------------------------------------------------
const porContexto = agruparPorContexto(declaracoes);

const porContextoDecidido = []; // pequeno NAQUELE contexto: sobrescrever so ali
const jaPassa = []; // ja esta no piso ou acima, naquele contexto
const relativos = []; // em/rem/% ou var(): nao da para decidir por numero

// A decisao e por (seletor, contexto), e nao pelo seletor inteiro. Um mesmo
// seletor pode ser pequeno dentro de um `@media` e ja passar do piso fora dele:
// `.janela-agente-abrir` e 12px ate 600px e 12.5px acima disso. Julgar pelo
// seletor inteiro fazia o caso pequeno ser pulado -- e eram justamente os 12px
// que apareciam no celular.
for (const grupo of porContexto.values()) {
  const numeros = grupo.valores.map(emPx);
  // Vale a ULTIMA declaracao do grupo na ordem do bundle, nao a maior. Um mesmo
  // (seletor, contexto) pode ser declarado duas vezes com numeros diferentes:
  // `.xl-sidebar-brand strong` e 13px em planilha.css e 11px em eap.css, e e o
  // 11px que vence. Usar Math.max pulava o caso pequeno e o defeito ficava.
  const decisivo = numeros[numeros.length - 1];
  if (decisivo === null) relativos.push(grupo);
  else if (decisivo < PISO) porContextoDecidido.push(grupo);
  else jaPassa.push(grupo);
}

// Agrupa por (contexto de media normalizado, valor): um unico bloco por grupo,
// em vez de centenas de blocos de tres linhas.
//
// O contexto precisa ser preservado: sobrescrever na raiz faria um texto que o
// app declara pequeno apenas dentro de um `@media (max-width: 560px)` virar
// 12,5px tambem na faixa de 561 a 900px, onde ele nao e declarado e herda um
// tamanho maior -- ou seja, encolheria. O app usa `@media` aninhado, entao a
// cadeia e normalizada: varios `max-width` equivalem ao menor deles.
const grupos = new Map();
const naoNormalizaveis = [];
for (const grupo of porContextoDecidido) {
  const { contexto, temOutros } = normalizarMediaCampo(grupo.media);
  const valor = grupo.valores[grupo.valores.length - 1]; // a declaracao que vence
  // O `!important` e ESPELHADO, nao forcado. Onde o app declara o tamanho pequeno
  // sem `!important`, basta chegar depois com a mesma especificidade. Forcar
  // `!important` fazia o override vencer tambem regras MAIS especificas que
  // apontavam para um tamanho maior -- medido: 6 botoes (`.scopo-btn.secondary`,
  // `.pl-atividades-btn.secondary`) caem de 16px para 12.5px, porque o override
  // de `button`/`.scopo-btn` vencia `.scopo-btn.secondary` pelo `!important`.
  const importante = grupo.importantes[grupo.importantes.length - 1];
  if (temOutros) {
    naoNormalizaveis.push({ seletor: grupo.seletor, media: grupo.media, valor });
    continue;
  }
  const chave = `${contexto}|||${valor}|||${importante}`;
  if (!grupos.has(chave)) grupos.set(chave, { contexto, valor, importante, seletores: new Set() });
  grupos.get(chave).seletores.add(grupo.seletor);
}

const contextos = new Map();
for (const g of grupos.values()) contextos.set(g.contexto, (contextos.get(g.contexto) || 0) + 1);

console.log(`\nArquivos lidos: ${arquivos.join(", ")}`);
console.log(`Declaracoes de tamanho: ${declaracoes.length}`);
console.log(`Pares (seletor, contexto): ${porContexto.size}`);
console.log(`\n  abaixo do piso em seu contexto : ${porContextoDecidido.length}  (serao sobrescritos)`);
console.log(`  ja no piso ou acima            : ${jaPassa.length}  (nao serao tocados)`);
console.log(`  sem numero (em/rem/%/var)      : ${relativos.length}  (revisar a mao)`);
console.log(`\n  grupos a emitir (contexto + valor): ${grupos.size}`);
console.log(`  seletores alcancados: ${[...grupos.values()].reduce((s, g) => s + g.seletores.size, 0)}`);
console.log("  contextos de media resolvidos:");
for (const [ctx, n] of [...contextos.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${(ctx || "(sem @media)").padEnd(26)} ${n} grupos`);
}
if (naoNormalizaveis.length) {
  console.log(`\n  NAO normalizaveis (contexto com condicao que nao e de largura): ${naoNormalizaveis.length}`);
  for (const n of naoNormalizaveis.slice(0, 20)) {
    console.log(`    ${n.seletor.slice(0, 56).padEnd(58)} ${n.media}  -> ${n.valor}`);
  }
}

const distribuir = {};
for (const d of declaracoes) {
  const v = emPx(d.valor);
  if (v === null || v >= PISO) continue;
  distribuir[d.valor] = (distribuir[d.valor] || 0) + 1;
}
console.log("\nValores abaixo do piso, por frequencia:");
for (const [v, n] of Object.entries(distribuir).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))) {
  console.log(`  ${v.padEnd(9)} ${String(n).padStart(4)}x`);
}

if (relativos.length) {
  console.log("\nUnidade relativa (revisao manual, ver secao 3 de mobile.css):");
  for (const r of relativos.slice(0, 30)) {
    const ctx = r.media ? "  dentro de " + r.media.slice(0, 40) : "";
    console.log(`  ${r.seletor.slice(0, 66).padEnd(68)} ${r.valores.join(", ")}${ctx}`);
  }
}

// --- 3. gera ----------------------------------------------------------------
if (!GERAR) {
  console.log("\n(sem --gerar: nada foi escrito)\n");
  process.exit(0);
}

const linhas = [];
linhas.push("/* GERADO por scripts/gerar-tipografia-campo.mjs -- nao editar a mao.");
linhas.push(" *");
linhas.push(" * Piso tipografico de campo. Sobe as declaracoes de tamanho que o app define");
linhas.push(" * abaixo de " + PISO + "px, usando o MESMO seletor da regra original e no mesmo");
linhas.push(" * contexto de @media: especificidade igual, declaracao depois, ultima vence.");
linhas.push(" *");
linhas.push(" * O app escreve tamanho de duas formas -- `font-size: 9px` e o atalho");
linhas.push(" * `font: 800 8px/1 ui-monospace` -- e as duas sao lidas aqui. A segunda");
linhas.push(" * escapava, e era onde estavam justamente os rotulos menores.");
linhas.push(" *");
linhas.push(" * O `!important` e espelhado, nunca forcado: onde o app declara o tamanho");
linhas.push(" * pequeno com `!important` (`.eap-workspace-agent` e 8.5px `!important`), a");
linhas.push(" * sobrescrita tambem o leva, senao continuaria perdendo; onde o app nao usa,");
linhas.push(" * a sobrescrita tambem nao usa -- assim ela nao atropela regras mais");
linhas.push(" * especificas que apontam para um tamanho maior.");
linhas.push(" *");
linhas.push(" * Por que nao uma regra universal de `font-size` (que seria bem menor):");
linhas.push(" * uma regra universal achata a escala. Em `font-size`, o `1em` vale o");
linhas.push(" * tamanho do PAI, entao `max(12,5px, 1em)` ENCOLHE todo texto maior que o");
linhas.push(" * pai. Medido em 15 telas: os titulos h1 (21px) e h2 (20px) caiam para 16px,");
linhas.push(" * junto com 42 elementos no total. Aqui nada encolhe: so e tocado o par");
linhas.push(" * (seletor, contexto) que declara abaixo do piso, e um numero grande");
linhas.push(" * declarado por outro seletor nao e alcancado.");
linhas.push(" *");
linhas.push(" * Escopo: apenas tela estreita com o dedo. No desktop nada muda.");
linhas.push(" */");
linhas.push("");
linhas.push("@media (max-width: 900px) and (pointer: coarse) {");

const ordenados = [...grupos.values()].sort(
  (a, b) => parseFloat(a.valor) - parseFloat(b.valor) || a.contexto.localeCompare(b.contexto)
);
for (const grupo of ordenados) {
  const seletores = [...grupo.seletores].sort((a, b) => a.localeCompare(b)).join(",\n    ");
  const declaracao = `font-size: var(--campo-fonte-min)${grupo.importante ? " !important" : ""};`;
  linhas.push(
    `  /* o app declarava ${grupo.valor}${grupo.contexto ? " em " + grupo.contexto : ""} nestes ${grupo.seletores.size} seletores */`
  );
  if (grupo.contexto) {
    linhas.push(`  @media ${grupo.contexto} {`);
    linhas.push(`    ${seletores} {`);
    linhas.push(`      ${declaracao}`);
    linhas.push("    }");
    linhas.push("  }");
  } else {
    linhas.push(`  ${seletores} {`);
    linhas.push(`    ${declaracao}`);
    linhas.push("  }");
  }
  linhas.push("");
}

linhas.push("}");
linhas.push("");

const totalSeletores = [...grupos.values()].reduce((s, g) => s + g.seletores.size, 0);
writeFileSync(DESTINO, linhas.join("\n"), "utf8");
console.log(`\nEscrito: ${DESTINO}  (${totalSeletores} seletores em ${grupos.size} grupos, ${linhas.length} linhas)\n`);
