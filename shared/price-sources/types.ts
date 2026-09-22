/**
 * Ponto de extensão do módulo de fontes de preços de referência.
 * Novas fontes (SINAPI, fontes próprias, fornecedores) plugam aqui
 * implementando PriceSourceAdapter — o pipeline de importação não muda.
 */

export interface ParsedPriceRecord {
  code: string;
  description: string;
  unit: string;
  unitPrice: number;
  /** Inferido do prefixo do código quando possível (I... insumo, C... serviço). */
  itemType: "material" | "mao_de_obra" | "equipamento" | "servico";
  notes?: string;
}

export interface PriceParseResult {
  records: ParsedPriceRecord[];
  /** Referência detectada no arquivo (ex.: versão Seinfra "028.1" ou mês/ano no nome). */
  referenceHint: string | null;
  /** Linhas ignoradas por não terem preço/unidade válidos (tolerância de layout). */
  skipped: number;
}

export interface PriceSourceAdapter {
  /** Identificador estável da fonte; casa com priceCatalogs.sourceType. */
  readonly sourceType: "propria" | "SINAPI" | "SEINFRA" | "fornecedor";
  /** Se este adapter aceita o arquivo (extensão/conteúdo). */
  canParse(fileName: string, bytes: Uint8Array): boolean;
  /**
   * Extrai registros do arquivo. Nunca deve lançar por variação de layout
   * esperada — usar `skipped` para linhas não reconhecidas.
   */
  parse(fileName: string, bytes: Uint8Array): Promise<PriceParseResult>;
}

const adapters = new Map<string, PriceSourceAdapter>();

export function registerPriceSourceAdapter(adapter: PriceSourceAdapter): void {
  adapters.set(adapter.sourceType, adapter);
}

export function getPriceSourceAdapter(
  sourceType: string
): PriceSourceAdapter | undefined {
  return adapters.get(sourceType);
}

export function listPriceSourceAdapters(): PriceSourceAdapter[] {
  return [...adapters.values()];
}
