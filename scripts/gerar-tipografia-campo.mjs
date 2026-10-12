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

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const RAIZ = "C:/Users/Correta Engenharia/po-develop/client/src";
const PISO = 12.5;
const GERAR = process.argv.includes("--gerar");
const DESTINO = path.join(RAIZ, "campo-tipografia.css");

// --- 1. lê os arquivos -------------------------------------------------------
// As camadas de campo ficam de fora: uma nao pode ler a outra (e `mobile.css`
// tem `@media` aninhado, que este leitor simples nao interpreta).
const IGNORAR = new Set(["mobile.css", "campo-tipografia.css"]);
//
// A ORDEM dos arquivos e a do bundle, e nao a alfabetica (`readdirSync`). Com
// especificidade igual a ULTIMA declaracao vence, entao saber quem vem depois e
// o que decide o tamanho real. Ler em ordem alfabetica punha planilha.css por
// ultimo, e o gerador concluia que os 13px que ele declara em
// `.xl-sidebar-brand strong` venciam -- mas quem vence sao os 11px de eap.css,
// que vem depois. Resultado: o seletor ficava sem override e o nome da obra no
// topo da gaveta continuava a 11px (medido).
// Ordem real, tirada do grafo de imports: main.tsx importa `./App` ANTES de
// `./index.css`; Home.tsx importa planilha.css antes de eap.css; e
// theme-tokens.css e importado no topo de index.css.
const ORDEM = ["planilha.css", "eap.css", "theme-tokens.css", "index.css"];
const disponiveis = readdirSync(RAIZ).filter((f) => f.endsWith(".css") && !IGNORAR.has(f));
const arquivos = [
  ...ORDEM.filter((f) => disponiveis.includes(f)),
  ...disponiveis.filter((f) => !ORDEM.includes(f)),
];
const declaracoes = []; // { arquivo, seletor, media, valor }

// Leitor de CSS por profundidade de chaves.
//
// A primeira versao deste leitor procurava o proximo "{" e o proximo "}" e
// nunca desempilhava o ambiente de `@media`: depois do primeiro `@media` do
// arquivo, TODA regra seguinte era considerada dentro dele. O contexto saia
// errado para quase todo o index.css (o encadeamento virava o menor `max-width`
// visto ate ali). Aqui a pilha sobe no "{" e desce no "}".
function lerRegras(texto) {
  const achadas = [];
  const pilha = [];
  let inicioDoCabecalho = 0;
  let i = 0;

  while (i < texto.length) {
    const c = texto[i];

    if (c === "{") {
      const cabecalho = texto.slice(inicioDoCabecalho, i).trim();
      const semLixo = cabecalho.replace(/^[}\s;]+/, "");

      if (semLixo.startsWith("@")) {
        pilha.push(semLixo);
        inicioDoCabecalho = i + 1;
        i += 1;
        continue;
      }

      const fim = texto.indexOf("}", i);
      if (fim === -1) break;
      achadas.push({
        seletor: semLixo.replace(/\s+/g, " "),
        corpo: texto.slice(i + 1, fim),
        contexto: pilha.filter((p) => /^@(media|supports|container)/.test(p)).join(" && "),
      });
      i = fim + 1;
      inicioDoCabecalho = i;
      continue;
    }

    if (c === "}") {
      pilha.pop();
      inicioDoCabecalho = i + 1;
    }
    i += 1;
  }

  return achadas;
}

for (const arquivo of arquivos) {
  const bruto = readFileSync(path.join(RAIZ, arquivo), "utf8");
  const semComentario = bruto.replace(/\/\*[\s\S]*?\*\//g, "");

  for (const regra of lerRegras(semComentario)) {
    const { seletor, corpo, contexto } = regra;
    if (!seletor || seletor.includes("{") || seletor.includes("}")) continue;

    const mAtalho = /(?:^|[;\s])font\s*:\s*([^;]+)/i.exec(corpo);
    const mTamanho = /font-size\s*:\s*([^;]+)/i.exec(corpo);
    const posAtalho = mAtalho ? mAtalho.index : -1;
    const posTamanho = mTamanho ? mTamanho.index : -1;

    let valor = null;
    let origem = null;
    let importante = false;

    // O app escreve tamanho de duas formas: `font-size: 9px` e o atalho
    // `font: 800 8px/1 ui-monospace`. Ler so o `font-size` deixava de fora
    // justamente os rotulos menores -- `.scopo-tag`, `.pl-atividade-tag`,
    // `td.mono`, `.pl-duracao-input` entre outros.
    if (mTamanho && posTamanho > posAtalho) {
      importante = /!important/i.test(mTamanho[1]);
      valor = mTamanho[1].replace(/!important/i, "").trim();
      origem = "font-size";
    } else if (mAtalho) {
      importante = /!important/i.test(mAtalho[1]);
      // De "800 8px/1 ui-monospace" interessa o "8px": o tamanho e o primeiro
      // pedaco que termina em unidade de tamanho, ignorando peso e familia.
      for (const pedaco of mAtalho[1].split(/[\s,]+/)) {
        const antesDaBarra = pedaco.split("/")[0];
        if (/^[\d.]+(px|rem|em|%|pt)$/i.test(antesDaBarra)) {
          valor = antesDaBarra;
          origem = "atalho font";
          break;
        }
      }

      // Mas o atalho pode estar INVALIDO e o navegador descarta a declaracao
      // inteira -- e ai o tamanho que vale nao e o que esta escrito. O caso real
      // e `font: 700 11px/1 inherit`: a familia do atalho nao aceita palavra
      // reservada (`inherit`, `initial`, `unset`, `revert`), so `font: inherit`
      // sozinho. O Chrome joga fora o `font:` todo, o botao herda a fonte da
      // pagina e fica com 16px. O gerador lia "11px" e sobrescrevia para 12.5px,
      // ENCOLHENDO o botao -- medido em 6 botoes (`.pl-atividades-btn.secondary`,
      // `.scopo-btn.secondary`, os filtros `.ativo`). Lendo a declaracao como
      // invalida, o seletor fica de fora e o tamanho herdado permanece.
      const ultimaPalavra = mAtalho[1].replace(/!important/i, "").trim().split(/\s+/).pop();
      if (ultimaPalavra && /^(inherit|initial|unset|revert|revert-layer)$/i.test(ultimaPalavra)) {
        valor = null;
        origem = null;
        importante = false;
      }
    }

    if (valor !== null) {
      declaracoes.push({ arquivo, seletor, media: contexto, valor, origem, importante });
    }
  }
}

// --- 2. classifica ----------------------------------------------------------
const emPx = (v) => {
  const m = /^([\d.]+)px$/i.exec(v);
  return m ? parseFloat(m[1]) : null;
};

const porContexto = new Map();
for (const d of declaracoes) {
  const chave = `${d.media}|||${d.seletor}`;
  if (!porContexto.has(chave)) {
    porContexto.set(chave, { seletor: d.seletor, media: d.media, valores: [], origens: [], importantes: [] });
  }
  const grupo = porContexto.get(chave);
  grupo.valores.push(d.valor);
  grupo.origens.push(d.origem);
  grupo.importantes.push(d.importante);
}

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
const normalizarMedia = (cadeia) => {
  if (!cadeia) return { contexto: "", temOutros: false };
  const partes = cadeia.split(" && ");
  const larguras = [];
  const outros = [];
  for (const parte of partes) {
    for (const cond of parte.replace(/^@media\s*/, "").match(/\([^)]*\)/g) || []) {
      const max = /\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(cond);
      const min = /\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(cond);
      if (max) larguras.push(parseFloat(max[1]));
      else if (min) outros.push(`(min-width: ${parseFloat(min[1])}px)`);
      else outros.push(cond);
    }
  }
  const teto = larguras.length ? Math.min(...larguras) : null;
  // Acima de 900px a camada de campo nem se aplica: o contexto resolvido vira vazio.
  const tetoUtil = teto !== null && teto < 900 ? `(max-width: ${teto}px)` : "";
  const condicoes = [tetoUtil, ...outros].filter(Boolean);
  return { contexto: condicoes.join(" and "), temOutros: outros.length > 0 };
};

const grupos = new Map();
const naoNormalizaveis = [];
for (const grupo of porContextoDecidido) {
  const { contexto, temOutros } = normalizarMedia(grupo.media);
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
