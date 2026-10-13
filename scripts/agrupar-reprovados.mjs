// Agrupa reprovados de contraste por assinatura de estilo, juntando as telas.
//
// Uso: node scripts/agrupar-reprovados.mjs [arquivo.json]
import { readFileSync } from "fs";

const ARQ = process.argv[2] || "tests/contraste/relatorio.json";
const dados = JSON.parse(readFileSync(ARQ, "utf8"));

const grupos = new Map();
for (const t of dados) {
  for (const l of t.leituras) {
    if (l.passou) continue;
    const chave = `${l.caminho} || ${l.cor} sobre ${l.fundo} || ${l.fonte}`;
    if (!grupos.has(chave)) grupos.set(chave, { ...l, telas: new Set(), indefinido: false });
    grupos.get(chave).telas.add(t.tela);
  }
}
for (const t of dados) {
  for (const x of t.lugaresSemFundo || []) {
    const chave = `(fundo com gradiente) ${x}`;
    if (!grupos.has(chave)) grupos.set(chave, { caminho: x, cor: "?", fundo: "gradiente", fonte: "?", razao: 0, minimo: 0, telas: new Set(), indefinido: true });
    grupos.get(chave).telas.add(t.tela);
  }
}

const lista = [...grupos.values()].sort((a, b) => (a.indefinido ? 1 : 0) - (b.indefinido ? 1 : 0) || a.razao - b.razao);
console.log(`grupos distintos: ${lista.length} | telas medidas: ${dados.length}`);
console.log(`total de reprovados: ${dados.reduce((s, t) => s + t.falhas, 0)} de ${dados.reduce((s, t) => s + t.avaliados, 0)}`);
for (const g of lista) {
  if (g.indefinido) {
    console.log(`\n  FUNDO COM GRADIENTE (nao medivel): ${g.caminho}\n      telas: ${g.telas.size}`);
    continue;
  }
  console.log(`\n  ${g.razao}:1 (minimo ${g.minimo})  ${g.cor} sobre ${g.fundo}  ${g.fonte}  [${g.telas.size} telas]`);
  console.log(`  ${g.caminho}`);
  console.log(`  ex.: "${g.texto}"   estado: ${JSON.stringify(g.estado)}`);
  console.log(`  telas: ${[...g.telas].slice(0, 3).join(", ")}${g.telas.size > 3 ? ` (+${g.telas.size - 3})` : ""}`);
}
