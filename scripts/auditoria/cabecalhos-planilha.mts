/**
 * Detecta as linhas de CABEÇALHO de tabela em cada aba: linhas com células
 * curtas, sem prosa, em sequência — o esqueleto do modelo de dados.
 */
import { readFileSync, writeFileSync } from "node:fs";

const XLSX = await import("xlsx");
const wb = XLSX.read(new Uint8Array(readFileSync(process.argv[2]!)), { type: "array" });

const out: string[] = [];
for (const nome of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome]!, {
    header: 1, raw: true, defval: null, blankrows: false,
  });
  out.push(`\n=== ${nome} ===`);
  rows.forEach((linha, indice) => {
    const celulas = (linha ?? [])
      .map(v => (v === null || v === undefined ? "" : String(v).trim()))
      .filter(Boolean);
    if (celulas.length < 3) return;
    // Cabeçalho = todas curtas, sem ponto final, e a maioria em maiúsculas.
    const curtas = celulas.every(c => c.length <= 34 && !c.includes("."));
    const maiusculas = celulas.filter(c => c === c.toUpperCase()).length;
    if (curtas && maiusculas >= Math.ceil(celulas.length * 0.5)) {
      out.push(`  L${indice + 1}  ${celulas.join(" | ")}`);
    }
  });
}

writeFileSync("docs/planilha-cabecalhos.txt", out.join("\n"), "utf-8");
console.log(out.join("\n"));
console.log(`\n[docs/planilha-cabecalhos.txt]`);
