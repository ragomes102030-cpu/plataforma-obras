/**
 * Importação incremental do catálogo SEINFRA-CE.
 *
 * Carrega a planilha inteira em memória e grava em lotes, para não
 * estourar o limite de 512MB do Render com 65.000 composições +
 * 3.755 insumos de uma só vez.
 */
import {
  serviceCompositions,
  compositionComponents,
  priceCatalogs,
  priceItems,
  type ServiceComposition,
} from "../drizzle/schema";
import { db } from "./db";
import { and, eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";

const LOTES = 500;

// ------------------------------------------------------------------
// Helpers de parse
// ------------------------------------------------------------------

function parseNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

// ------------------------------------------------------------------
// 1. Ler e salvar catálogo (priceCatalogs)
// ------------------------------------------------------------------

async function upsertCatalog(
  source: string,
  referencePeriod: string,
  fileName: string,
  uploadedBy: number
): Promise<number> {
  const existing = await db.query.priceCatalogs.findFirst({
    where: and(
      eq(priceCatalogs.sourceType, source),
      eq(priceCatalogs.referencePeriod, referencePeriod)
    ),
  });
  if (existing) {
    console.log(`  Catálogo ${source}/${referencePeriod} já existe (id=${existing.id})`);
    return existing.id;
  }
  const [created] = await db
    .insert(priceCatalogs)
    .values({
      name: `${source} ${referencePeriod} — importado de ${fileName}`,
      sourceType: source,
      referencePeriod,
      status: "ativo",
      uploadedBy,
    })
    .returning({ id: priceCatalogs.id });
  console.log(`  Catálogo ${source}/${referencePeriod} criado (id=${created.id})`);
  return created.id;
}

// ------------------------------------------------------------------
// 2. Ler e salvar insumos (priceItems)
// ------------------------------------------------------------------

async function upsertInsumos(
  catalogId: number,
  insumos: Array<{ code: string; description: string; unit: string; unitPrice: number; itemType: string }>
): Promise<number> {
  let count = 0;
  for (let i = 0; i < insumos.length; i += LOTES) {
    const lote = insumos.slice(i, i + LOTES);
    await db.transaction(async (tx) => {
      for (const item of lote) {
        const existing = await tx.query.priceItems.findFirst({
          where: and(
            eq(priceItems.catalogId, catalogId),
            eq(priceItems.code, item.code)
          ),
        });
        if (existing) {
          await tx.update(priceItems)
            .set({ description: item.description, unit: item.unit, unitPrice: item.unitPrice, updatedAt: new Date() })
            .where(eq(priceItems.id, existing.id));
        } else {
          await tx.insert(priceItems).values({
            catalogId,
            code: item.code,
            description: item.description,
            unit: item.unit,
            unitPrice: item.unitPrice,
            itemType: item.itemType as any,
            referencePeriod: "SEINFRA-CE 028.1",
          });
        }
      }
    });
    count += lote.length;
    console.log(`  Insumos: ${count}/${insumos.length}`);
  }
  return count;
}

// ------------------------------------------------------------------
// 3. Ler e salvar composições (serviceCompositions + compositionComponents)
// ------------------------------------------------------------------

type Composicao = {
  code: string;
  description: string;
  unit: string;
  unitPrice: number;
  components: Array<{ insumoCode: string; coefficient: number; unit: string }>;
};

async function upsertComposicoes(
  catalogId: number,
  composicoes: Composicao[]
): Promise<number> {
  let count = 0;
  for (let i = 0; i < composicoes.length; i += LOTES) {
    const lote = composicoes.slice(i, i + LOTES);
    await db.transaction(async (tx) => {
      for (const comp of lote) {
        const existing = await tx.query.serviceCompositions.findFirst({
          where: and(
            eq(serviceCompositions.sourceCatalogId, catalogId),
            eq(serviceCompositions.code, comp.code)
          ),
        });
        let compId: number;
        if (existing) {
          await tx.update(serviceCompositions)
            .set({ description: comp.description, unit: comp.unit, updatedAt: new Date() })
            .where(eq(serviceCompositions.id, existing.id));
          compId = existing.id;
        } else {
          const [created] = await tx.insert(serviceCompositions).values({
            code: comp.code,
            description: comp.description,
            unit: comp.unit,
            sourceCatalogId: catalogId,
            referencePeriod: "SEINFRA-CE 028.1",
            status: "validada",
          }).returning({ id: serviceCompositions.id });
          compId = created.id;
        }

        // Substitui componentes antigos
        await tx.delete(compositionComponents).where(
          eq(compositionComponents.compositionId, compId)
        );
        if (comp.components.length > 0) {
          await tx.insert(compositionComponents).values(
            comp.components.map((c) => ({
              compositionId: compId,
              priceItemId: c.priceItemId!,
              componentType: "mao_de_obra",
              coefficient: c.coefficient,
              unitPriceSnapshot: 0, // preenchido depois via JOIN
            }))
          );
        }
      }
    });
    count += lote.length;
    console.log(`  Composições: ${count}/${composicoes.length}`);
  }
  return count;
}

// ------------------------------------------------------------------
// 4. Função principal
// ------------------------------------------------------------------

export async function importarSeinfraCE(
  filePathInsumos: string,
  filePathComposicoes: string,
  referencePeriod: string,
  uploadedBy: number
) {
  console.log("=== Importação SEINFRA-CE ===");

  // Ler planilhas
  const wbInsumos = XLSX.readFile(filePathInsumos);
  const wbComposicoes = XLSX.readFile(filePathComposicoes);

  const sheetInsumos = wbInsumos.Sheets[wbInsumos.SheetNames[0]];
  const sheetComposicoes = wbComposicoes.Sheets[wbComposicoes.SheetNames[0]];

  const rowsInsumos = XLSX.utils.sheet_to_json(sheetInsumos, { header: 1, raw: false, defval: "" }) as any[][];
  const rowsComposicoes = XLSX.utils.sheet_to_json(sheetComposicoes, { header: 1, raw: false, defval: "" }) as any[][];

  // Extrair insumos
  const insumos = rowsInsumos.slice(1).map((row) => ({
    code: clean(row[0]),
    description: clean(row[1]),
    unit: clean(row[2]),
    unitPrice: parseNumber(row[3]) ?? 0,
    itemType: "servico", // simplificado
  })).filter((i) => i.code);

  // Extrair composições (estrutura simplificada: cada linha tem código, descrição, unidade, preço)
  const composicoes: Composicao[] = [];
  let currentComp: Composicao | null = null;

  for (const row of rowsComposicoes.slice(1)) {
    const code = clean(row[0]);
    if (code.startsWith("C") && clean(row[1])) {
      if (currentComp) composicoes.push(currentComp);
      currentComp = {
        code,
        description: clean(row[1]),
        unit: clean(row[2]),
        unitPrice: parseNumber(row[3]) ?? 0,
        components: [],
      };
    } else if (currentComp && clean(row[0]) && clean(row[1])) {
      const coeff = parseNumber(row[2]) ?? 0;
      if (coeff > 0) {
        currentComp.components.push({
          insumoCode: clean(row[0]),
          coefficient: coeff,
          unit: clean(row[1]),
        });
      }
    }
  }
  if (currentComp) composicoes.push(currentComp);

  console.log(`  Insumos lidos: ${insumos.length}`);
  console.log(`  Composições lidas: ${composicoes.length}`);

  // Gravar catálogo
  const catalogId = await upsertCatalog("SEINFRA", referencePeriod, "import-seinfra", uploadedBy);

  // Gravar insumos
  await upsertInsumos(catalogId, insumos);

  // Buscar priceItems para vincular às composições
  const allPriceItems = await db.query.priceItems.findMany({
    where: eq(priceItems.catalogId, catalogId),
  });
  const priceItemByCode = new Map(allPriceItems.map((p) => [p.code, p]));

  // Enriquecer composições com priceItemId
  const composicoesEnriquecidas: Composicao[] = composicoes.map((comp) => ({
    ...comp,
    components: comp.components.map((c) => {
      const priceItem = priceItemByCode.get(c.insumoCode);
      return { ...c, priceItemId: priceItem?.id ?? null };
    }).filter((c) => c.priceItemId),
  }));

  // Gravar composições
  await upsertComposicoes(catalogId, composicoesEnriquecidas);

  console.log("=== Importação concluída ===");
  return { catalogId, insumos: insumos.length, composicoes: composicoes.length };
}

// Uso: node import-seinfra-ce.mjs <insumos.xls> <composicoes.xls> <userId>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, insumosPath, composicoesPath, userIdStr] = process.argv;
  if (!insumosPath || !composicoesPath) {
    console.error("Uso: node import-seinfra-ce.mjs <insumos.xls> <composicoes.xls>");
    process.exit(1);
  }
  const userId = parseInt(userIdStr) || 1;
  await importarSeinfraCE(insumosPath, composicoesPath, "SEINFRA-CE 028.1", userId);
}
