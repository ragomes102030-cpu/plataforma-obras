/**
 * Despeja uma aba: valor e fórmula de cada célula preenchida.
 *   npx tsx scripts/auditoria/despejar-aba.mts <arquivo> "<aba>" [maxLinhas]
 */
import { readFileSync, writeFileSync } from "node:fs";

const caminho = process.argv[2]!;
const alvo = process.argv[3]!;
const maxLinhas = Number(process.argv[4] ?? 200);

const XLSX = await import("xlsx");
const wb = XLSX.read(new Uint8Array(readFileSync(caminho)), { type: "array" });
const sheet = wb.Sheets[alvo];
if (!sheet) {
  console.error(`aba inexistente: ${alvo}`);
  console.error(`disponiveis: ${wb.SheetNames.join(" | ")}`);
  process.exit(1);
}

const ref = sheet["!ref"] ?? "A1";
const faixa = XLSX.utils.decode_range(ref);
const col = (n: number) => XLSX.utils.encode_col(n);

const out: string[] = [];
out.push(`=== ABA ${alvo} (${ref}) ===`);
out.push("");

for (let r = 0; r <= Math.min(faixa.e.r, maxLinhas - 1); r += 1) {
  const celulas: string[] = [];
  for (let c = 0; c <= faixa.e.c; c += 1) {
    const chave = `${col(c)}${r + 1}`;
    const cel = (sheet as Record<string, { f?: string; v?: unknown; t?: string }>)[chave];
    if (!cel) continue;
    const bruto = cel.v === null || cel.v === undefined ? "" : String(cel.v);
    const formula = cel.f ? ` =${cel.f}` : "";
    const txt = `${bruto}${formula}`.trim();
    if (!txt) continue;
    celulas.push(`${chave}: ${txt}`);
  }
  if (celulas.length) out.push(`L${r + 1}  ${celulas.join("  |  ")}`);
}

const arquivo = `docs/aba-${alvo.replace(/[^\w-]/g, "_")}.txt`;
writeFileSync(arquivo, out.join("\n"), "utf-8");
console.log(out.join("\n"));
console.log(`\n[gravado em ${arquivo}]`);
