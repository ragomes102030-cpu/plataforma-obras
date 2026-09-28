/**
 * Confere se o mapa de taxonomia do motor ainda bate com a planilha.
 *
 *   npx tsx scripts/conferir-mapa-seinfra.mts <caminho.xls>
 *
 * Lê a hierarquia da planilha e compara com `CAPITULOS_SEINFRA` e
 * `SUBGRUPOS_SEINFRA` em `shared/eap-engine.ts`. Mostra:
 *
 * - nome do mapa que NÃO existe mais na planilha (virou letra morta);
 * - o nome mais próximo na planilha, para corrigir a digitação;
 * - capítulo novo na planilha que o mapa não cobre (serviço que ninguém
 *   consegue classificar por taxonomia).
 *
 * Rodar antes de importar uma versão nova. Foi assim que apareceu o erro de
 * digitação "embrasamentos" — o mapa dizia EMBRASAMENTOS e a planilha traz
 * EMBASAMENTOS, e o override de subgrupo simplesmente nunca casava.
 */
import { readFileSync } from "node:fs";
import { parseSeinfraRows, extrairTrilha } from "../shared/price-sources/seinfra";
import { normalizar } from "../shared/eap-engine";

const caminho = process.argv[2];
if (!caminho) {
  console.error("uso: npx tsx scripts/conferir-mapa-seinfra.mts <caminho.xls>");
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(caminho));
const XLSX = await import("xlsx");
const wb = XLSX.read(bytes, { type: "array" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  raw: true,
  defval: null,
  blankrows: false,
});
const parsed = parseSeinfraRows(rows, caminho);

const capitulosReais = new Set<string>();
const subgruposReais = new Set<string>();
for (const registro of parsed.records) {
  const trilha = extrairTrilha(registro.notes);
  if (trilha.length > 0) capitulosReais.add(normalizar(trilha[0]!));
  if (trilha.length > 1) subgruposReais.add(normalizar(trilha[1]!));
}

const fonte = readFileSync("shared/eap-engine.ts", "utf-8");
const blocoCapitulos = fonte.slice(
  fonte.indexOf("const CAPITULOS_SEINFRA"),
  fonte.indexOf("const SUBGRUPOS_SEINFRA")
);
const blocoSubgrupos = fonte.slice(
  fonte.indexOf("const SUBGRUPOS_SEINFRA"),
  fonte.indexOf("const SUBGRUPOS_NORMALIZADOS")
);
const capitulosDoMapa = [...blocoCapitulos.matchAll(/"([^"]+)":\s*"[a-z]+",/g)].map(m =>
  normalizar(m[1]!)
);
const subgruposDoMapa = [...blocoSubgrupos.matchAll(/\["([^"]+)",\s*"[a-z]+"\]/g)].map(m =>
  normalizar(m[1]!)
);

/** Distância de Levenshtein, para sugerir o nome certo quando não casa. */
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) d[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[a.length]![b.length]!;
}

function conferir(rotulo: string, doMapa: string[], daPlanilha: Set<string>): number {
  let problemas = 0;
  console.log(`=== ${rotulo} (${doMapa.length} no mapa) ===`);
  for (const nome of doMapa) {
    if (daPlanilha.has(nome)) continue;
    // O motor casa por prefixo em segunda passada, para o subgrupo que embute
    // norma técnica no título (12.8 traz "(ABNT NBR 9952:2014)"). Isso não é
    // letra morta, e não deve ser reportado como tal.
    if ([...daPlanilha].some(real => real.startsWith(nome))) {
      console.log(`  por prefixo  ${JSON.stringify(nome)}`);
      continue;
    }
    let proximo: string | null = null;
    let menor = Infinity;
    for (const real of daPlanilha) {
      const dist = distancia(nome, real);
      if (dist < menor) {
        menor = dist;
        proximo = real;
      }
    }
    console.log(`  NAO EXISTE  ${JSON.stringify(nome)}`);
    if (proximo && menor <= 6) {
      console.log(`     mais proximo: ${JSON.stringify(proximo)} (distancia ${menor})`);
    }
    problemas += 1;
  }
  if (problemas === 0) console.log("  todos os nomes do mapa existem na planilha");
  console.log("");
  return problemas;
}

let problemas = 0;
problemas += conferir("subgrupos", subgruposDoMapa, subgruposReais);
problemas += conferir("capitulos", capitulosDoMapa, capitulosReais);

const naoMapeados = [...capitulosReais].filter(c => !capitulosDoMapa.includes(c));
console.log("=== capitulos da planilha sem entrada no mapa ===");
if (naoMapeados.length === 0) {
  console.log("  nenhum");
} else {
  for (const capitulo of naoMapeados) console.log(`  ${JSON.stringify(capitulo)}`);
  console.log("  (um capitulo sem entrada cai na classificacao por descricao)");
}

console.log(
  problemas === 0
    ? "\nO mapa bate com a planilha."
    : `\n${problemas} nome(s) do mapa nao existem na planilha.`
);
process.exit(problemas === 0 ? 0 : 1);
