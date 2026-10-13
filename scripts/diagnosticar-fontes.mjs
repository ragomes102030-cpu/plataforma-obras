// Diagnostico de tamanhos de fonte por contexto de @media.
//
// Serve para responder a pergunta que decide o desenho da camada de desktop:
// as declaracoes pequenas estao na raiz (sem @media) ou dentro de faixas de
// largura? Se estiverem na raiz, um override por `min-width` nao corre risco de
// encolher nada em faixa nenhuma.

import { listarFontes, emPx } from "./css-fontes-lib.mjs";

const RAIZ = "C:/Users/Correta Engenharia/po-develop/client/src";
const PISO = 12.5;

const { declaracoes } = listarFontes(RAIZ);

const porMedia = new Map();
for (const d of declaracoes) {
  const chave = d.media || "(raiz, sem @media)";
  if (!porMedia.has(chave)) porMedia.set(chave, { total: 0, pequenas: 0, exemplos: new Set() });
  const g = porMedia.get(chave);
  g.total += 1;
  const v = emPx(d.valor);
  if (v !== null && v < PISO) {
    g.pequenas += 1;
    if (g.exemplos.size < 4) g.exemplos.add(`${d.seletor.slice(0, 48)} = ${d.valor}`);
  }
}

console.log("\nDeclaracoes de font-size por contexto:\n");
console.log("  " + "contexto".padEnd(56) + "total   <12,5px");
for (const [ctx, g] of [...porMedia.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${ctx.slice(0, 54).padEnd(56)}${String(g.total).padStart(5)}  ${String(g.pequenas).padStart(7)}`);
}

// A pergunta central: um seletor que declara pequeno na raiz declara ALGO MAIOR
// em outro contexto? Se sim, um override de raiz o encolheria naquele contexto.
const porSeletor = new Map();
for (const d of declaracoes) {
  if (!porSeletor.has(d.seletor)) porSeletor.set(d.seletor, []);
  porSeletor.get(d.seletor).push(d);
}

let conflito = 0;
const exemplos = [];
for (const [seletor, ds] of porSeletor) {
  const raiz = ds.filter((d) => !d.media);
  const outros = ds.filter((d) => d.media);
  if (!raiz.length || !outros.length) continue;
  const vRaiz = emPx(raiz[raiz.length - 1].valor);
  if (vRaiz === null || vRaiz >= PISO) continue;
  const maiorEmMedia = outros.some((d) => {
    const v = emPx(d.valor);
    return v !== null && v >= PISO;
  });
  if (maiorEmMedia) {
    conflito += 1;
    if (exemplos.length < 25) {
      exemplos.push(
        `${seletor.slice(0, 50).padEnd(52)} raiz=${raiz[raiz.length - 1].valor}  outro=${outros.map((d) => `${d.valor}@${d.media}`).join(" | ").slice(0, 60)}`
      );
    }
  }
}

console.log(`\n\nSeletores pequenos na raiz que ficam >= piso dentro de algum @media: ${conflito}`);
console.log("(se forem muitos, um override de raiz sem faixa encolheria texto naquele media)\n");
for (const e of exemplos) console.log("  " + e);
console.log("");
