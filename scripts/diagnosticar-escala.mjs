// Retrato da escala tipografica: quais tamanhos o app usa, com que frequencia e
// em que lugares.
//
//   node diagnosticar-escala.mjs
//
// A pergunta que ele responde: os tamanhos acima do piso formam uma escala ou
// sao ruido? Se dois valores diferentes estao a menos de ~4% de distancia, o
// navegador nao distingue os dois e a diferenca so cria manutencao.

import { listarFontes, emPx } from "./css-fontes-lib.mjs";

const RAIZ = "C:/Users/Correta Engenharia/po-develop/client/src";
const PISO = 12.5;

const { declaracoes } = listarFontes(RAIZ);
const base = declaracoes.filter((d) => !d.media);

const porValor = new Map(); // valor -> { n, seletores: Map(seletor -> n), importantes }
for (const d of base) {
  const v = emPx(d.valor);
  if (v === null) continue;
  if (!porValor.has(v)) porValor.set(v, { n: 0, seletores: new Map(), importantes: 0 });
  const g = porValor.get(v);
  g.n += 1;
  if (d.importante) g.importantes += 1;
  for (const s of d.seletor.split(",").map((x) => x.trim()).filter(Boolean)) {
    g.seletores.set(s, (g.seletores.get(s) || 0) + 1);
  }
}

const ordem = [...porValor.entries()].sort((a, b) => a[0] - b[0]);

console.log(`\nDeclaracoes de font-size na raiz (sem @media): ${base.length}`);
console.log(`Valores distintos: ${ordem.length}`);
console.log(`  abaixo do piso (${PISO}px): ${ordem.filter(([v]) => v < PISO).length} valores`);
console.log(`  no piso ou acima          : ${ordem.filter(([v]) => v >= PISO).length} valores\n`);

console.log("valor     seletores  !imp   distancia do anterior   maiores usuarios");
let anterior = null;
const rio = [];
for (const [v, g] of ordem) {
  const dist = anterior === null ? "" : `${(((v - anterior) / anterior) * 100).toFixed(1)}%`;
  const grandes = [...g.seletores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([s, n]) => `${s.slice(0, 26)}${n > 1 ? " x" + n : ""}`).join("  ");
  const marca = v >= PISO ? "  " : "<<";
  console.log(`${String(v).padStart(6)}px ${String(g.seletores.size).padStart(9)} ${String(g.importantes).padStart(5)}   ${dist.padStart(8)}  ${marca} ${grandes}`);
  if (v >= PISO) rio.push({ valor: v, seletores: g.seletores.size, n: g.n, dist: anterior === null ? null : (v - anterior) / anterior });
  anterior = v;
}

// Onde a escala se embola: dois degraus a menos de 4% um do outro.
const embolados = rio.filter((d) => d.dist !== null && d.dist < 0.04);
console.log(`\nDegraus a menos de 4% do degrau anterior (o olho nao separa): ${embolados.length}`);
for (const d of embolados) console.log(`  ${d.valor}px  (${(d.dist * 100).toFixed(1)}% acima do anterior, ${d.seletores} seletores)`);

// Espacamento medio entre degraus, que e o que a escala "quer" ser.
const passos = rio.slice(1).map((d) => d.dist).filter((d) => d !== null);
if (passos.length) {
  const medio = passos.reduce((a, b) => a + b, 0) / passos.length;
  console.log(`\nSalto relativo medio entre degraus: ${(medio * 100).toFixed(1)}%`);
  console.log(`(um salto assim redondo sugeriria uma escala modular; ruido dobra em cima de ruido)\n`);
}
