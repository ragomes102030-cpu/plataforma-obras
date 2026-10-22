import { describe, expect, it } from "vitest";
import { compararComBaseline } from "../shared/desvios-baseline";

/**
 * CONSISTÊNCIA COM A BASELINE.
 *
 * A baseline só vira controle quando a pergunta "o que mudou desde a aprovação?"
 * tem resposta em dias, atividade por atividade. Estes testes fixam as regras
 * do relatório — inclusive a ligação por código da EAP, que é o que salva a
 * comparação quando o planejamento é refeito e os ids mudam.
 */

const atual = (
  id: number,
  wbsCode: string,
  inicio: number | null,
  fim: number | null,
  durationDays = 5
) => ({ id, wbsCode, name: `Atividade ${wbsCode}`, earlyStart: inicio, earlyFinish: fim, durationDays });

const base = (activityId: number, wbsCode: string, inicio: number | null, fim: number | null) => ({
  activityId,
  wbsCode,
  name: `Atividade ${wbsCode}`,
  earlyStart: inicio,
  earlyFinish: fim,
  durationDays: 5,
});

describe("comparar com a baseline", () => {
  it("mede o atraso em dias no término", () => {
    const { linhas, resumo } = compararComBaseline(
      [base(1, "1.1", 0, 10)],
      [atual(1, "1.1", 0, 15)]
    );

    expect(linhas[0].situacao).toBe("atrasada");
    expect(linhas[0].deltaFim).toBe(5);
    expect(resumo.atrasoNoFim).toBe(5);
    expect(resumo.atrasoMedioFim).toBe(5);
  });

  it("reconhece avanço sem chamar de atraso", () => {
    const { resumo } = compararComBaseline(
      [base(1, "1.1", 0, 10), base(2, "1.2", 10, 20)],
      [atual(1, "1.1", 0, 8), atual(2, "1.2", 8, 18)]
    );

    expect(resumo.atrasadas).toBe(0);
    expect(resumo.adiantadas).toBe(2);
    expect(resumo.maiorAvanco).toBe(-2);
    expect(resumo.atrasoNoFim).toBe(0);
  });

  it("casa por código quando a EAP foi refeita e os ids mudaram", () => {
    const { linhas, resumo } = compararComBaseline(
      [base(7, "1.2.3", 0, 10)],
      [atual(99, "1.2.3", 0, 12)]
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0].situacao).toBe("atrasada");
    expect(linhas[0].atividadeId).toBe(99);
    expect(resumo.novas).toBe(0);
    expect(resumo.removidas).toBe(0);
  });

  it("aponta escopo novo e escopo que sumiu", () => {
    const { linhas, resumo } = compararComBaseline(
      [base(1, "1.1", 0, 10), base(2, "1.2", 10, 20)],
      [atual(1, "1.1", 0, 10), atual(3, "1.3", 20, 25)]
    );

    expect(resumo.novas).toBe(1);
    expect(resumo.removidas).toBe(1);
    expect(linhas.find(l => l.wbsCode === "1.2")?.situacao).toBe("removida");
    expect(linhas.find(l => l.wbsCode === "1.3")?.situacao).toBe("nova");
    // Escopo removido não pode contar como atraso: não tem data de hoje.
    expect(resumo.atrasoNoFim).toBe(0);
  });

  it("não inventa desvio quando falta data de CPM", () => {
    const { linhas, resumo } = compararComBaseline(
      [base(1, "1.1", 0, 10)],
      [atual(1, "1.1", 0, null)]
    );

    expect(linhas[0].situacao).toBe("indefinida");
    expect(linhas[0].deltaFim).toBeNull();
    expect(resumo.indefinidas).toBe(1);
  });

  it("separa alongamento de duração de atraso de término", () => {
    // Mesmo início, término 5 dias depois, mas a duração subiu de 10 para 15.
    const { resumo } = compararComBaseline(
      [base(1, "1.1", 0, 10)],
      [atual(1, "1.1", 0, 15)]
    );

    expect(resumo.mudancaDeDuracao).toBe(1);
    expect(resumo.duracaoBaseline).toBe(10);
    expect(resumo.duracaoAtual).toBe(15);
  });

  it("tudo é novo quando ainda não existe baseline", () => {
    const { resumo, linhas } = compararComBaseline([], [atual(1, "1.1", 0, 10)]);

    expect(resumo.novas).toBe(1);
    expect(resumo.duracaoBaseline).toBe(0);
    expect(linhas[0].baselineFim).toBeNull();
  });

  it("mantém a ordem das atividades atuais e põe as removidas no fim", () => {
    const { linhas } = compararComBaseline(
      [base(1, "1.1", 0, 10), base(2, "1.2", 10, 20)],
      [atual(1, "1.1", 0, 10)]
    );

    expect(linhas.map(l => l.chave)).toEqual(["1.1", "1.2"]);
  });
});
