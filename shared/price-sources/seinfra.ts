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
  // A coluna `CÓDIGO` do Planos-de-Serviços é o código oficial do serviço
  // (C2820, C0053...). Ela tem de ser preferida sobre `ITEM`, que é a
  // numeração hierárquica da própria planilha (1.1.1) e NÃO existe no catálogo.
  // Sem essa distinção o parser lia `1.1.1` como código e nenhum serviço
  // casava com `C...` — a EAP nascia vazia mesmo com a base importada.
  officialCode: ["codigo", "código", "cod"],
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
  // Prefere igualdade exata; includes só para sinônimos compostos ("valor unitario").
  return synonyms.some(syn => header === syn || (syn.length > 3 && header.includes(syn)));
}

interface HeaderMap {
  code: number;
  description: number;
  unit: number;
  price: number;
  rowIndex: number;
  /**
   * Numeração hierárquica da própria planilha (1.1.1), quando existe. É a
   * estrutura que a SEINFRA já traz pronta e que serve de espinha dorsal da EAP.
   */
  item?: number;
}

/** Sniffa a primeira linha que pareça cabeçalho (≥3 colunas reconhecidas). */
export function findHeaderRow(rows: SheetRow[]): HeaderMap | null {
  const scanLimit = Math.min(rows.length, 30);
  for (let r = 0; r < scanLimit; r += 1) {
    const row = rows[r] ?? [];
    const cells = row.map(normalizeCell);
    let code = -1;
    let item = -1;
    let description = -1;
    let unit = -1;
    let price = -1;
    for (let c = 0; c < cells.length; c += 1) {
      const cell = cells[c];
      // `CÓDIGO` tem precedência; `ITEM` é a hierarquia numérica e só entra
      // se não houver coluna de código oficial.
      if (code < 0 && matchHeaderField(cell, HEADER_SYNONYMS.officialCode))
        code = c;
      if (item < 0 && cell === "item") item = c;
      if (description < 0 && matchHeaderField(cell, HEADER_SYNONYMS.description))
        description = c;
      if (unit < 0 && matchHeaderField(cell, HEADER_SYNONYMS.unit)) unit = c;
      if (price < 0 && matchHeaderField(cell, HEADER_SYNONYMS.price)) price = c;
    }
    if (code < 0) {
      // Sem coluna `CÓDIGO`, tenta a lista ampla. A Tabela de Insumos 028
      // traz o cabeçalho como ["Insumo", "Descrição", "Unidade", "Valor (R$)"]
      // e "Insumo" não é `ITEM` nem `CÓDIGO` — é o nome da própria coluna.
      const amplo = cells.findIndex(cell =>
        matchHeaderField(cell, HEADER_SYNONYMS.code)
      );
      if (amplo >= 0) code = amplo;
      else {
        // E, por último, `ITEM` — hierarquia numérica da planilha.
        code = item;
        item = -1;
      }
    }
    const hits = [code, description, unit, price].filter(index => index >= 0)
      .length;
    // Título de tabela ("Preço de Insumos / Serviços") pode casar vários
    // sinônimos na MESMA célula — exige colunas distintas para code/desc/price.
    const distinctCore =
      code >= 0 &&
      description >= 0 &&
      price >= 0 &&
      code !== description &&
      code !== price &&
      description !== price;
    const unitOk =
      unit < 0 || (unit !== code && unit !== description && unit !== price);
    if (distinctCore && unitOk && hits >= 3) {
      return item >= 0
        ? { code, description, unit, price, rowIndex: r, item }
        : { code, description, unit, price, rowIndex: r };
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

  // No Planos-de-Serviços, a hierarquia vem em colunas separadas: `ITEM`
  // (1.1.1) e `CÓDIGO` (C2820). As LINHAS DE AGRUPAMENTO — o capítulo
  // ("1 FUNDAÇÕES E ESTRUTURAS") e o subgrupo ("6.1 TUBULÕES A CÉU ABERTO") —
  // trazem o nome na coluna de CÓDIGO e a descrição vazia. Sem elas a planilha
  // vira uma lista plana de 4.400 serviços sem qualquer noção de do que se
  // trata, e a EAP sai com as peças na ala errada.
  //
  // A pilha por profundidade reconstrói o caminho completo do serviço, que é a
  // taxonomia oficial da SEINFRA e a informação mais confiável que o catálogo
  // carrega sobre cada linha.
  const temItem = header.item !== undefined && header.item >= 0;
  const pilha = new Map<number, string>();

  for (let r = header.rowIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const code = String(row[header.code] ?? "").trim();
    const descricao = String(row[header.description] ?? "").trim();
    const item = temItem ? String(row[header.item!] ?? "").trim() : "";
    const unit =
      header.unit >= 0 ? String(row[header.unit] ?? "").trim() : "";
    const price = parsePtBrCurrency(row[header.price]);

    // Linha de agrupamento: código oficial ausente, descrição presente, e a
    // numeração hierárquica com menos níveis que a seguinte. Vira um nó da
    // pilha e NÃO é descartada — é ela que nomeia o capítulo.
    if (temItem && code && !descricao && ehNumeroDeItem(item)) {
      const profundidade = item.split(".").length;
      pilha.set(profundidade, code);
      for (const nivel of [...pilha.keys()]) {
        if (nivel > profundidade) pilha.delete(nivel);
      }
      continue;
    }
    if (!code || !descricao || price === null || price < 0) {
      if (code || descricao) skipped += 1;
      continue;
    }

    const profundidade = ehNumeroDeItem(item) ? item.split(".").length : 0;
    const trilha: string[] = [];
    for (let nivel = 1; nivel < profundidade; nivel += 1) {
      const nome = pilha.get(nivel);
      if (nome) trilha.push(nome);
    }

    records.push({
      code,
      // A descrição fica limpa: é o nome que o usuário lê na EAP. A trilha vai
      // para `notes`, e a classificação a usa como sinal mais forte.
      description: descricao.slice(0, 240),
      unit: (unit || "UN").slice(0, 32),
      unitPrice: price,
      itemType: inferItemType(code, descricao),
      notes: montarNota(item, trilha),
    });
  }
  return {
    records,
    referenceHint: extractReferenceHint(fileName),
    skipped,
  };
}

/** `1`, `1.1`, `1.1.10` — a numeração hierárquica da planilha. */
function ehNumeroDeItem(item: string): boolean {
  return /^\d+(\.\d+)*$/.test(item);
}

/** Separador entre capítulos/subgrupos dentro de `notes`. */
const SEPARADOR_TRILHA = " > ";

/**
 * Grava a posição do serviço na planilha oficial.
 *
 * `notes` é a única coluna de texto livre de `price_items` e já era usada para
 * guardar o `item`. Guardar a trilha aqui evita uma migração só para levar a
 * taxonomia oficial da SEINFRA até o motor da EAP — e o formato é legível, para
 * dar para conferir na tela o que o importador entendeu.
 */
function montarNota(item: string, trilha: string[]): string | undefined {
  const partes: string[] = [];
  if (item) partes.push(`item ${item}`);
  if (trilha.length) partes.push(trilha.join(SEPARADOR_TRILHA));
  return partes.length ? partes.join(" | ") : undefined;
}

/**
 * Lê de volta a trilha gravada em `notes`.
 *
 * O motor da EAP classifica pelo CAPÍTULO da SEINFRA (é a taxonomia oficial e
 * acerta onde palavra solta erra), então a trilha precisa sobreviver à
 * ida-e-volta pelo banco.
 */
export function extrairTrilha(notas: string | null | undefined): string[] {
  if (!notas) return [];
  const separador = notas.indexOf(" | ");
  if (separador === -1) return [];
  return notas
    .slice(separador + 3)
    .split(SEPARADOR_TRILHA)
    .map(parte => parte.trim())
    .filter(Boolean);
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
