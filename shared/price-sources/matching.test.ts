import { describe, expect, it } from "vitest";
import {
  exceedsPriceThreshold,
  findCandidates,
  levenshtein,
  normalizeForMatch,
  priceVariation,
  similarityScore,
  type ComparableRecord,
} from "./matching";
import { reconcilePriceItem } from "./reconciliation";

const base: ComparableRecord[] = [
  {
    kind: "composition",
    id: 1,
    code: "C1000",
    description: "CONCRETO ESTRUTURAL FA 25 PROEM PISO",
    unit: "M3",
    unitPrice: 520,
  },
  {
    kind: "composition",
    id: 2,
    code: "C2850",
    description: "INSTALACOES PROVISORIAS DE LUZ FORCA TELEFONE",
    unit: "UN",
    unitPrice: 1510.9,
  },
  {
    kind: "priceItem",
    id: 3,
    code: "I0001",
    description: "BLOCO CIMENTO 14X19X39",
    unit: "UN",
    unitPrice: 4.8,
  },
];

describe("normalizeForMatch", () => {
  it("remove acentos e pontuação", () => {
    expect(normalizeForMatch("Concreto Estrutural, FA-25!")).toBe(
      "concreto estrutural fa 25"
    );
  });
});

describe("levenshtein/similarity", () => {
  it("distância básica", () => {
    expect(levenshtein("casa", "casa")).toBe(0);
    expect(levenshtein("casa", "casa")).toBe(0);
    expect(levenshtein("abc", "axc")).toBe(1);
  });

  it("similarity alta para variação de caixa/acentos", () => {
    expect(similarityScore("Concreto Estrutural", "CONCRETO ESTRUTURAL")).toBe(1);
    expect(similarityScore("concreto estrutural", "concreto estrutural fa")).toBeGreaterThan(0.7);
  });
});

describe("findCandidates — nunca autolink, só candidatos", () => {
  it("encontra composição por nome parecido (serviço composto)", () => {
    const result = findCandidates("Concreto estrutural", base);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].kind).toBe("composition");
    expect(result[0].code).toBe("C1000");
    expect(result[0].score).toBeGreaterThan(0.5);
  });

  it("encontra insumo por nome", () => {
    const result = findCandidates("Bloco de cimento 14x19", base, {
      minScore: 0.3,
    });
    expect(result.some(item => item.code === "I0001")).toBe(true);
  });

  it("ordena por score e respeita limit", () => {
    const result = findCandidates("instalações provisórias de luz", base, {
      limit: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("C2850");
  });

  it("query vazia ou sem candidato retorna vazio (sem autolink)", () => {
    expect(findCandidates("", base)).toHaveLength(0);
    expect(findCandidates("xyzzy completely unrelated", base)).toHaveLength(0);
  });
});

describe("priceVariation / threshold", () => {
  it("calcula variação relativa", () => {
    expect(priceVariation(100, 130)).toBeCloseTo(0.3);
    expect(priceVariation(100, 70)).toBeCloseTo(0.3);
    expect(priceVariation(0, 50)).toBe(1);
  });

  it("threshold default 30% e configurável", () => {
    expect(exceedsPriceThreshold(100, 129, 30)).toBe(false);
    expect(exceedsPriceThreshold(100, 131, 30)).toBe(true);
    expect(exceedsPriceThreshold(100, 131, 50)).toBe(false);
    expect(exceedsPriceThreshold(100, 131, 10)).toBe(true);
    // valor inválido cai no default 30
    expect(exceedsPriceThreshold(100, 131, Number.NaN)).toBe(true);
  });
});

describe("reconcilePriceItem — revisão técnica sem autolink", () => {
  it("retorna candidato compatível e calcula variação", () => {
    const result = reconcilePriceItem(
      { code: "C1000", description: "Concreto estrutural", unit: "m³", manualPrice: 500 },
      base,
    );
    expect(result.status).toBe("candidato");
    expect(result.candidates[0].unitCompatible).toBe(true);
    expect(result.candidates[0].variation).toBeCloseTo(0.04);
  });

  it("não converte unidade incompatível", () => {
    const result = reconcilePriceItem(
      { description: "Concreto estrutural", unit: "m²", manualPrice: 500 },
      base,
    );
    expect(result.status).toBe("unidade_incompativel");
    expect(result.candidates[0].unitCompatible).toBe(false);
    expect(result.candidates[0].reason).toMatch(/não fará conversão/i);
  });

  it("marca ausência de candidato sem criar vínculo", () => {
    expect(reconcilePriceItem({ description: "Serviço inexistente", unit: "vb" }, base).status)
      .toBe("sem_candidato");
  });
});
