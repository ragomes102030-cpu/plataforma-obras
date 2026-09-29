/**
 * Inventário da planilha de referência: abas, dimensões, cabeçalhos e
 * densidade de fórmulas por aba. Nada de alteração — só leitura.
 */
import { readFileSync, writeFileSync } from "node:fs";

const caminho = process.argv[2]!;
const bytes = new Uint8Array(readFileSync(caminho));
const XLSX = await import("xlsx");
const wb = XLSX.read(bytes, { type: "array" });

const relatorio: string[] = [];
const w = (s = "") => relatorio.push(s);

w(`arquivo: ${caminho}`);
w(`bytes: ${bytes.length}`);
w(`abas: ${wb.SheetNames.length}`);
w("");

// Funções mais usadas, para ver a matemática real da planilha.
const FUNCOES = /\b([A-Z][A-Z0-9_.]{1,20})\s*\(/g;
const contagemFuncoes = new Map<string, number>();

w("=== RESUMO POR ABA ===");
for (const nome of wb.SheetNames) {
  const sheet = wb.Sheets[nome]!;
  const ref = sheet["!ref"] ?? "(vazia)";
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, raw: true, defval: null, blankrows: false,
  });
  let celulasFormula = 0;
  let celulas = 0;
  let preenchidas = 0;
  for (const chave of Object.keys(sheet)) {
    if (chave.startsWith("!")) continue;
    celulas += 1;
    const v = (sheet as Record<string, { f?: string; v?: unknown }>)[chave]!;
    if (v.v !== null && v.v !== undefined && v.v !== "") preenchidas += 1;
    if (v.f) {
      celulasFormula += 1;
      for (const m of v.f.matchAll(FUNCOES)) {
        contagemFuncoes.set(m[1]!, (contagemFuncoes.get(m[1]!) ?? 0) + 1);
      }
    }
  }
  w(
    `${nome.padEnd(24)} ref=${ref.padEnd(14)} linhas=${String(rows.length).padStart(5)} celulas=${String(preenchidas).padStart(6)} formulas=${String(celulasFormula).padStart(6)}`
  );
}

w("");
w("=== FUNCOES MAIS USADAS (toda a pasta) ===");
const ordenadas = [...contagemFuncoes].sort((a, b) => b[1] - a[1]);
for (const [fn, n] of ordenadas.slice(0, 60)) {
  w(`  ${String(n).padStart(6)}  ${fn}`);
}

writeFileSync("docs/planilha-inventario.txt", relatorio.join("\n"), "utf-8");
console.log(relatorio.join("\n"));
