import { describe, expect, it } from "vitest";
import { avaliarProntidaoDeAvanco, type EntradaProntidaoDeAvanco } from "./progress-readiness";

const base: EntradaProntidaoDeAvanco = {
  pesosFisicosAprovados: true,
  temProducaoConfirmada: true,
  orcamentoAprovado: true,
  orcamentoDidatico: false,
  atividadesSemCusto: 0,
};

describe("prontidão independente do avanço físico e financeiro", () => {
  it.each([
    [{ ...base, pesosFisicosAprovados: false }, "sem_pesos", "disponivel", false],
    [{ ...base, temProducaoConfirmada: false }, "sem_producao", "disponivel", false],
    [{ ...base, orcamentoAprovado: false }, "disponivel", "sem_orcamento", false],
    [{ ...base, orcamentoDidatico: true }, "disponivel", "didatico", false],
    [{ ...base, atividadesSemCusto: 3 }, "disponivel", "cobertura_incompleta", false],
    [base, "disponivel", "disponivel", true],
  ] as const)("classifica a matriz %# sem acoplar os eixos", (entrada, fisico, financeiro, evDisponivel) => {
    expect(avaliarProntidaoDeAvanco(entrada)).toMatchObject({ fisico, financeiro, evDisponivel });
  });

  it("orçamento ausente não bloqueia o avanço físico por atividade", () => {
    const resultado = avaliarProntidaoDeAvanco({ ...base, orcamentoAprovado: false });
    expect(resultado.fisico).toBe("disponivel");
    expect(resultado.financeiro).toBe("sem_orcamento");
  });

  it("explica como resolver e como confirmar cada ausência", () => {
    const resultado = avaliarProntidaoDeAvanco({
      ...base,
      pesosFisicosAprovados: false,
      orcamentoDidatico: true,
    });
    expect(resultado.orientacoes.map(item => item.id)).toEqual([
      "avanco-fisico-sem-pesos",
      "orcamento-didatico",
    ]);
    for (const orientacao of resultado.orientacoes) {
      expect(orientacao.passos.length).toBeGreaterThan(0);
      expect(orientacao.evidenciaDeResolucao.length).toBeGreaterThan(10);
      expect(`${orientacao.titulo} ${orientacao.oQueAconteceu} ${orientacao.porQueBloqueia}`).not.toMatch(/r[eé]gua validada/i);
    }
  });

  it("separa falha de consulta física da financeira", () => {
    expect(avaliarProntidaoDeAvanco({ ...base, erroFisico: true })).toMatchObject({ fisico: "erro", financeiro: "disponivel" });
    expect(avaliarProntidaoDeAvanco({ ...base, erroFinanceiro: true })).toMatchObject({ fisico: "disponivel", financeiro: "erro" });
  });
});
