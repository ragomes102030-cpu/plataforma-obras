import { describe, expect, it } from "vitest";
import { resumirCobertura, sugerirVinculos } from "./conciliacao";

/**
 * Contrato da conciliação cronograma ↔ orçamento.
 *
 * Estes testes nasceram de um caso real: na AURORA TESTE as 53 atividades do
 * cronograma e os 53 itens do orçamento tinham os MESMOS códigos WBS, e ainda
 * assim nenhuma atividade apontava para item nenhum. O sistema não errava —
 * simplesmente não tinha como saber. É esse "não tinha como saber" que a
 * sugestão resolve, e é a ordem das sugestões que estes testes fixam.
 */

const itens = [
  {
    id: 201,
    code: "1.1.1",
    description: "Pilares - Alvenaria estrutural bloco concreto 19x19x39",
    unit: "m3",
    quantity: 100,
    unitPrice: 10,
    compositionId: 55,
  },
  {
    id: 202,
    code: "1.2.1",
    description: "Alvenaria de vedacao bloco ceramico 9x19x39",
    unit: "m2",
    quantity: 200,
    unitPrice: 5,
    compositionId: null,
  },
  {
    id: 203,
    code: "1.3.1",
    description: "Impermeabilizacao de laje com manta asfaltica",
    unit: "m2",
    quantity: 50,
    unitPrice: 20,
    compositionId: null,
  },
];

const atividadeBase = {
  id: 1,
  wbsCode: "",
  name: "",
  unit: null,
  plannedQuantity: null,
  budgetItemId: null,
};

describe("sugerirVinculos", () => {
  it("código igual vence qualquer semelhança de texto", () => {
    const [sugestao] = sugerirVinculos(
      { ...atividadeBase, wbsCode: "1.1.1", name: "Serviço qualquer", unit: "m3" },
      itens
    );
    expect(sugestao.budgetItemId).toBe(201);
    expect(sugestao.reason).toBe("codigo");
    expect(sugestao.confidence).toBe(1);
  });

  it("código com separador diferente ainda casa", () => {
    const [sugestao] = sugerirVinculos(
      { ...atividadeBase, wbsCode: "1-1-1", name: "Pilares" },
      itens
    );
    expect(sugestao.budgetItemId).toBe(201);
    expect(sugestao.reason).toBe("codigo");
  });

  it("descrição parecida é sugerida, mas com confiança menor que código", () => {
    const [sugestao] = sugerirVinculos(
      { ...atividadeBase, wbsCode: "9.9.9", name: "Alvenaria de vedação", unit: "m2" },
      itens
    );
    expect(sugestao.budgetItemId).toBe(202);
    expect(sugestao.reason).toBe("descricao");
    expect(sugestao.confidence).toBeGreaterThanOrEqual(0.45);
    expect(sugestao.confidence).toBeLessThan(1);
  });

  it("unidade incompatível não é descartada, mas vem sinalizada e mais fraca", () => {
    const [sugestao] = sugerirVinculos(
      { ...atividadeBase, wbsCode: "", name: "Alvenaria de vedação", unit: "m3" },
      itens
    );
    expect(sugestao.budgetItemId).toBe(202);
    expect(sugestao.unitMismatch).toBe(true);
  });

  it("nada parecido não vira sugestão", () => {
    const sugestoes = sugerirVinculos(
      { ...atividadeBase, name: "Mobilização de canteiro", unit: "vb" },
      itens
    );
    expect(sugestoes).toHaveLength(0);
  });

  it("respeita o limite de candidatos devolvidos", () => {
    const sugestoes = sugerirVinculos(
      { ...atividadeBase, name: "Alvenaria", unit: "m2" },
      itens,
      1
    );
    expect(sugestoes).toHaveLength(1);
  });
});

describe("resumirCobertura", () => {
  it("mede a cobertura por valor, não por contagem de atividades", () => {
    const resumo = resumirCobertura(
      [
        { ...atividadeBase, id: 1, budgetItemId: 201, plannedQuantity: 50 },
        { ...atividadeBase, id: 2, budgetItemId: null },
      ],
      itens
    );
    // Item 201 = 100 m3 x R$10 = R$1.000; metade consumida.
    expect(resumo.valorTotal).toBe(1000 + 1000 + 1000);
    expect(resumo.valorVinculado).toBe(500);
    expect(resumo.atividadesVinculadas).toBe(1);
    expect(resumo.percentual).toBeCloseTo(500 / 3000, 6);
  });

  it("duas atividades no mesmo item não somam mais que o item", () => {
    const resumo = resumirCobertura(
      [
        { ...atividadeBase, id: 1, budgetItemId: 201, plannedQuantity: 80 },
        { ...atividadeBase, id: 2, budgetItemId: 201, plannedQuantity: 80 },
      ],
      [itens[0]]
    );
    expect(resumo.valorVinculado).toBe(1000);
    expect(resumo.percentual).toBe(1);
  });

  it("atividade vinculada sem quantidade não cobre valor e é contada à parte", () => {
    const resumo = resumirCobertura(
      [{ ...atividadeBase, id: 1, budgetItemId: 201, plannedQuantity: null }],
      [itens[0]]
    );
    expect(resumo.valorVinculado).toBe(0);
    expect(resumo.atividadesVinculadas).toBe(1);
    expect(resumo.atividadesSemQuantidade).toBe(1);
  });

  it("item vinculado a id inexistente é ignorado sem quebrar", () => {
    const resumo = resumirCobertura(
      [{ ...atividadeBase, id: 1, budgetItemId: 999, plannedQuantity: 10 }],
      [itens[0]]
    );
    expect(resumo.valorVinculado).toBe(0);
    expect(resumo.percentual).toBe(0);
  });

  it("conta itens sem composição — a outra metade do problema do EVM", () => {
    const resumo = resumirCobertura([], itens);
    expect(resumo.itensSemComposicao).toBe(2);
    expect(resumo.itensTotal).toBe(3);
    expect(resumo.valorTotal).toBe(3000);
  });

  it("orçamento vazio não divide por zero", () => {
    const resumo = resumirCobertura([], []);
    expect(resumo.percentual).toBe(0);
    expect(resumo.valorTotal).toBe(0);
  });
});
