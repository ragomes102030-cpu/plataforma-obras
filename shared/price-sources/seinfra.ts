/**
 * Parser tolerante da Tabela Unificada SEINFRA-CE.
 *
 * Formatos oficiais (download manual do site, sem scraping):
 * - Tabela-de-Insumos-<versão>---....xls  → códigos I....
 * - Planos-de-Servicos-<versão>---....xls → códigos C....
 * Layout varia entre versões mensais: NÃO hardcoded índice de célula —
 * a linha de cabeçalho é sniffada por sinônimos (Código/Descrição/Unidade/Valor).
 */

import type {
  PriceParseResult,
  ParsedPriceRecord,
  PriceSourceAdapter,
} from "./types";

const HEADER_SYNONYMS = {
  code: ["codigo", "código", "cod", "insumo", "item", "code"],
  description: [
    "descricao",
    "descrição",
    "desc",
    "denominacao",
    "denominação",
    "descricao do insumo",
    "descrição do insumo",
    "servico",
    "serviço",
  ],
  unit: ["unidade", "unid", "un", "un. und"],
  price: [
    "valor",
    "preco",
    "preço",
    "valor unitario",
    "valor unitário",
    "preco unitario",
    "preço unitário",
    "custo unitario",
    "custo unitário",
    "unitario",
    "unitário",
    "r$",
    "valor (r$)",
  ],
} as const;

type SheetRow = unknown[];

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** "1.234,56" | "1234,56" | "R$ 1.234,56" | 1234.56 → 1234.56 */
export function parsePtBrCurrency(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/r\$/gi, "")
    .trim();
  if (!raw) return null;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;
  if (hasComma && hasDot) {
    // pt-BR: ponto = milhar, vírgula = decimal
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  } else if (hasDot && raw.indexOf(".") !== raw.lastIndexOf(".")) {
    // vários pontos → milhares sem decimal
    normalized = raw.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchHeaderField(header: string, synonyms: readonly string[]): boolean {
  if (!header) return false;
  return synonyms.some(syn => header === syn || header.includes(syn));
}

interface HeaderMap {
  code: number;
  description: number;
  unit: number;
  price: number;
  rowIndex: number;
}

/** Sniffa a primeira linha que pareça cabeçalho (≥3 colunas reconhecidas). */
export function findHeaderRow(rows: SheetRow[]): HeaderMap | null {
  const scanLimit = Math.min(rows.length, 30);
  for (let r = 0; r < scanLimit; r += 1) {
    const row = rows[r] ?? [];
    const cells = row.map(normalizeCell);
    let code = -1;
    let description = -1;
    let unit = -1;
    let price = -1;
    for (let c = 0; c < cells.length; c += 1) {
      const cell = cells[c];
      if (code < 0 && matchHeaderField(cell, HEADER_SYNONYMS.code)) code = c;
      if (description < 0 && matchHeaderField(cell, HEADER_SYNONYMS.description))
        description = c;
      if (unit < 0 && matchHeaderField(cell, HEADER_SYNONYMS.unit)) unit = c;
      if (price < 0 && matchHeaderField(cell, HEADER_SYNONYMS.price)) price = c;
    }
    const hits = [code, description, unit, price].filter(index => index >= 0)
      .length;
    // Pelo menos código+descrição+valor (unidade às vezes vem como coluna mista)
    if (code >= 0 && description >= 0 && price >= 0 && hits >= 3) {
      return { code, description, unit, price, rowIndex: r };
    }
  }
  return null;
}

function inferItemType(code: string, description: string): ParsedPriceRecord["itemType"] {
  const upper = code.toUpperCase();
  if (upper.startsWith("C")) return "servico";
  if (upper.startsWith("I")) {
    const desc = normalizeCell(description);
    if (/mao de obra|mao-de-obra|\bajudante\b|\bpedreiro\b|\bservente\b|\bmestre\b/.test(desc))
      return "mao_de_obra";
    if (/aluguel|equipamento|locacao/.test(desc)) return "equipamento";
    return "material";
  }
  return "material";
}

/** Extrai versão/referência do nome do arquivo (ex.: "...-028.1---ENC..."). */
export function extractReferenceHint(fileName: string): string | null {
  const version = fileName.match(/(\d{2,3}\.\d{1,2}[A-Za-z]?)/);
  if (version) return version[1];
  const monthYear = fileName.match(/(\d{2})[/-](\d{4})/);
  if (monthYear) return `${monthYear[1]}/${monthYear[2]}`;
  return null;
}

/** Parser de bytes .xls/.xlsx via SheetJS (comum a file input e Buffer). */
async function readSheetRows(
  bytes: Uint8Array
): Promise<SheetRow[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(bytes, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json<SheetRow>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
}

export function parseSeinfraRows(rows: SheetRow[], fileName: string): PriceParseResult {
  const header = findHeaderRow(rows);
  const records: ParsedPriceRecord[] = [];
  let skipped = 0;
  if (!header) {
    return { records, referenceHint: extractReferenceHint(fileName), skipped: rows.length };
  }
  for (let r = header.rowIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const code = String(row[header.code] ?? "").trim();
    const description = String(row[header.description] ?? "").trim();
    const unit =
      header.unit >= 0 ? String(row[header.unit] ?? "").trim() : "";
    const price = parsePtBrCurrency(row[header.price]);
    if (!code || !description || price === null || price < 0) {
      if (code || description) skipped += 1;
      continue;
    }
    records.push({
      code,
      description: description.slice(0, 240),
      unit: (unit || "UN").slice(0, 32),
      unitPrice: price,
      itemType: inferItemType(code, description),
    });
  }
  return {
    records,
    referenceHint: extractReferenceHint(fileName),
    skipped,
  };
}

export const seinfraAdapter: PriceSourceAdapter = {
  sourceType: "SEINFRA",
  canParse(fileName) {
    const lower = fileName.toLowerCase();
    return lower.endsWith(".xls") || lower.endsWith(".xlsx");
  },
  async parse(fileName, bytes) {
    const rows = await readSheetRows(bytes);
    return parseSeinfraRows(rows, fileName);
  },
};
