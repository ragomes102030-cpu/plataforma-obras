// Mostra todos os lugares onde uma cor aparece, com o fundo de cada um. Serve
// para conferir se uma cor vive em contexto claro, escuro, ou nos dois.
//
// Uso: node scripts/onde-aparece-a-cor.mjs "rgb(36, 52, 60)" [arquivo.json]
import { readFileSync } from "fs";

const COR = process.argv[2];
const ARQ = process.argv[3] || "tests/contraste/antes.json";
const dados = JSON.parse(readFileSync(ARQ, "utf8"));
const achados = new Map();
for (const t of dados) {
  for (const l of t.leituras) {
    if (l.cor !== COR) continue;
    const k = `${l.caminho} || ${l.fundo}`;
    if (!achados.has(k)) achados.set(k, { caminho: l.caminho, fundo: l.fundo, razao: l.razao, passou: l.passou, exemplo: l.texto, telas: new Set(), fonte: l.fonte });
    achados.get(k).telas.add(t.tela);
  }
}
console.log(`leituras da cor ${COR}: ${achados.size} combinacoes de lugar + fundo`);
for (const a of achados.values()) {
  console.log(`\n  fundo ${a.fundo}  ${a.razao}:1  ${a.passou ? "passa" : "REPROVA"}  fonte ${a.fonte}`);
  console.log(`  caminho: ${a.caminho}`);
  console.log(`  ex.: "${a.exemplo}"`);
  console.log(`  telas (${a.telas.size}): ${[...a.telas].slice(0, 4).join(", ")}`);
}
