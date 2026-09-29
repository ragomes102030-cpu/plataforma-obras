/**
 * Extrai a DOCUMENTAÇÃO das abas: linhas de título, cabeçalhos de tabela e os
 * textos explicativos das colunas de comentário. É onde a planilha diz o que
 * cada fórmula significa, qual é a fonte e onde ela própria declara GAP.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const XLSX = await import("xlsx");
const wb = XLSX.read(
  new Uint8Array(readFileSync(process.argv[2]!)),
  { type: "array" }
);

// Palavras que marcam texto de regra, não dado.
const REGRA =
  /(fonte|onde|como |não confundir|nao confundir|gap|sem dado|deve|obrigat|deriva|calculad|nunca|sempre|regra|limitaç|limitac|fase 0|aguarda|exemplo|pedagógic|pedagogic|legado|modelo)/i;

const out: string[] = [];
for (const nome of wb.SheetNames) {
  const sheet = wb.Sheets[nome]!;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, raw: true, defval: null, blankrows: false,
  });
  out.push(`\n${"=".repeat(70)}`);
  out.push(`ABA ${nome}`);
  out.push("=".repeat(70));

  rows.forEach((linha, indice) => {
    const celulas = (linha ?? [])
      .map(v => (v === null || v === undefined ? "" : String(v)))
      .filter(Boolean);
    if (!celulas.length) return;
    // Linhas curtas: título, cabeçalho ou texto de regra.
    const texto = celulas.join(" | ");
    if (celulas.length <= 14 && REGRA.test(texto)) {
      out.push(`  L${indice + 1}  ${texto.slice(0, 700)}`);
    }
  });
}

writeFileSync("docs/planilha-documentacao.txt", out.join("\n"), "utf-8");
console.log(out.join("\n"));
console.log(`\n[docs/planilha-documentacao.txt]`);
void readdirSync;
