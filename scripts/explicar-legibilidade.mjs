// Explica por que um lugar (ou uma cor) foi ou nao virou regra no gerador.
//
// Uso: node scripts/explicar-legibilidade.mjs <trecho-do-caminho> [antes.json]
import { readFileSync } from "fs";
import { ajustar, paraRgb, razao } from "./contraste-lib.mjs";

const TRECHO = process.argv[2];
const ARQ = process.argv[3] || "tests/contraste/antes.json";
const dados = JSON.parse(readFileSync(ARQ, "utf8"));

const leituras = dados.flatMap(t => t.leituras.map(l => ({ ...l, tela: t.tela })));
const alvo = leituras.filter(l => l.caminho.includes(TRECHO) || l.chave.includes(TRECHO));
console.log(`leituras que casam com "${TRECHO}": ${alvo.length}`);
const porLugar = new Map();
for (const l of alvo) {
  if (!porLugar.has(l.caminho)) porLugar.set(l.caminho, []);
  porLugar.get(l.caminho).push(l);
}
for (const [caminho, lista] of porLugar) {
  const falhas = lista.filter(l => !l.passou);
  console.log(`\nlugar: ${caminho}`);
  console.log(`  leituras: ${lista.length} | reprovadas: ${falhas.length}`);
  const fundos = [...new Set(lista.map(l => l.fundo))];
  console.log(`  fundos: ${fundos.join(", ")}`);
  for (const cor of [...new Set(lista.map(l => l.cor))]) {
    const min = Math.max(...falhas.map(l => l.minimo));
    const r = ajustar(cor, fundos.map(paraRgb), Math.max(4.6, min));
    console.log(`  cor ${cor}: ${r ? `cor nova unica ${r.hex}` : "SEM COR NOVA UNICA (aparece em fundo claro e escuro)"}`);
    for (const f of fundos) console.log(`     sobre ${f}: ${razao(paraRgb(cor), paraRgb(f)).toFixed(2)}:1`);
  }
  console.log(`  estado: ${JSON.stringify([...new Set(lista.flatMap(l => l.estado || []))])}`);
}
