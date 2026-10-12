// Lista, com todos os dados, os textos que ainda reprovam contraste.
//
// Uso: node scripts/listar-reprovados.mjs
import { readFileSync } from "fs";

const dados = JSON.parse(readFileSync("tests/contraste/relatorio.json", "utf8"));
let n = 0;
for (const t of dados) {
  for (const l of t.leituras) {
    if (l.passou) continue;
    n++;
    console.log(`${t.tela} | ${l.razao}:1 (minimo ${l.minimo})`);
    console.log(`   cor ${l.cor} sobre ${l.fundo} | fonte ${l.fonte} | estado ${JSON.stringify(l.estado)}`);
    console.log(`   caminho: ${l.caminho}`);
    console.log(`   texto: "${l.texto}"`);
  }
}
console.log(`total: ${n}`);
