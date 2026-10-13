// Retrato do tamanho de letra por elemento, para achar o que e pequeno demais.
// Le uma leitura de contraste (que ja guarda fonte e caminho de cada texto).
//
// Uso: node scripts/retratar-fontes.mjs leitura.json [praca|campo] [limite]
import { readFileSync } from "fs";

const ARQ = process.argv[2] || "tests/contraste/depois-3obras.json";
const QUAL = process.argv[3] || "praca";
const LIMITE = Number(process.argv[4] ?? 11);
const dados = JSON.parse(readFileSync(ARQ, "utf8"));

const porTamanho = new Map(), porClasse = new Map();
let total = 0;
for (const t of dados) {
  if (!t.tela.startsWith(QUAL + "/")) continue;
  for (const l of t.leituras) {
    const px = parseFloat(l.fonte.split(" ")[1]);
    if (!isFinite(px)) continue;
    total++;
    const chave = l.caminho.split(" > ").pop();
    if (!porTamanho.has(px)) porTamanho.set(px, 0);
    porTamanho.set(px, porTamanho.get(px) + 1);
    if (px <= LIMITE) {
      if (!porClasse.has(chave)) porClasse.set(chave, { px, caminho: l.caminho, casos: 0, exemplo: l.texto, peso: l.fonte.split(" ")[0] });
      porClasse.get(chave).casos++;
    }
  }
}

console.log(`leituras em ${QUAL}: ${total}`);
console.log(`\n--- quantos textos por tamanho ---`);
for (const [px, n] of [...porTamanho].sort((a, b) => a[0] - b[0])) {
  if (px > 14) continue;
  console.log(`  ${String(px).padStart(5)}px  ${String(n).padStart(5)} ${n === 1 ? "texto" : "textos"}${px < 12.5 ? "   <-- abaixo de 12,5" : ""}`);
}
console.log(`\n--- estilos de ${LIMITE}px ou menos (${porClasse.size}) ---`);
for (const g of [...porClasse.values()].sort((a, b) => a.px - b.px || b.casos - a.casos)) {
  console.log(`  ${String(g.px).padStart(5)}px  peso ${g.peso.padStart(3)}  ${String(g.casos).padStart(4)}x  ${g.caminho.slice(-70)}  "${g.exemplo}"`);
}
