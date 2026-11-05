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

  it("distingue atividades diferentes que compartilham a mesma folha EAP", () => {
    const { linhas, resumo } = compararComBaseline(
      [
        { ...base(7, "1.8.1", 0, 10), name: "Projeto arquitetônico" },
        { ...base(8, "1.8.1", 10, 20), name: "Compatibilização" },
      ],
      [
        { ...atual(99, "1.8.1", 0, 12), name: "Projeto arquitetônico" },
        { ...atual(100, "1.8.1", 10, 22), name: "Compatibilização" },
      ],
    );

    expect(resumo.novas).toBe(0);
    expect(resumo.removidas).toBe(0);
    expect(linhas.map(linha => linha.atividadeId)).toEqual([99, 100]);
    expect(linhas.map(linha => linha.deltaFim)).toEqual([2, 2]);
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

  it.each([false, true])("não reutiliza baseline para uma atividade nova na mesma folha (ordem invertida: %s)", inverter => {
    const existente = { ...atual(1, "1.1", 0, 10), name: "Execução" };
    const nova = { ...atual(2, "1.1", 10, 12), name: "Inspeção nova" };
    const { linhas, resumo } = compararComBaseline(
      [{ ...base(1, "1.1", 0, 10), name: "Execução" }],
      inverter ? [nova, existente] : [existente, nova],
    );

    expect(linhas.find(linha => linha.atividadeId === 1)?.situacao).toBe("igual");
    expect(linhas.find(linha => linha.atividadeId === 2)).toMatchObject({ situacao: "nova", baselineInicio: null, deltaFim: null });
    expect(resumo).toMatchObject({ novas: 1, iguais: 1, atrasadas: 0, removidas: 0 });
  });

  it("reserva todos os ids antes de casar identidades textuais", () => {
    const { linhas, resumo } = compararComBaseline(
      [
        { ...base(1, "1.1", 0, 10), name: "Execução" },
        { ...base(2, "1.1", 10, 20), name: "Inspeção" },
      ],
      [
        { ...atual(3, "1.1", 0, 10), name: "Execução" },
        { ...atual(1, "1.1", 0, 12), name: "Execução renomeada" },
      ],
    );

    expect(linhas.find(linha => linha.atividadeId === 1)).toMatchObject({ baselineFim: 10, deltaFim: 2 });
    expect(linhas.find(linha => linha.atividadeId === 3)?.situacao).toBe("nova");
    expect(resumo).toMatchObject({ novas: 1, removidas: 1 });
  });

  it("reserva identidades antes do fallback por código e não adivinha códigos repetidos", () => {
    const { linhas, resumo } = compararComBaseline(
      [{ ...base(1, "1.1", 0, 10), name: "Execução" }],
      [
        { ...atual(3, "1.1", 10, 15), name: "Inspeção" },
        { ...atual(2, "1.1", 0, 10), name: "Execução" },
      ],
    );
    expect(linhas.find(linha => linha.atividadeId === 2)?.situacao).toBe("igual");
    expect(linhas.find(linha => linha.atividadeId === 3)?.situacao).toBe("nova");
    expect(resumo).toMatchObject({ iguais: 1, novas: 1, removidas: 0 });
  });

  it("aceita fallback de código somente inequívoco nas duas listas", () => {
    const resultado = compararComBaseline(
      [{ ...base(1, "1.1", 0, 10), name: "Nome anterior" }],
      [{ ...atual(2, "1.1", 0, 12), name: "Nome revisado" }],
    );
    expect(resultado.linhas[0]).toMatchObject({ situacao: "atrasada", deltaFim: 2 });
    const ambiguo = compararComBaseline(
      [{ ...base(1, "1.1", 0, 10), name: "Nome anterior" }],
      [
        { ...atual(2, "1.1", 0, 12), name: "Nome revisado" },
        { ...atual(3, "1.1", 12, 15), name: "Novo serviço" },
      ],
    );
    expect(ambiguo.resumo).toMatchObject({ novas: 2, removidas: 1, atrasadas: 0 });
  });

  it("não escolhe arbitrariamente entre identidades duplicadas de outra versão", () => {
    const resultado = compararComBaseline(
      [base(1, "1.1", 0, 10), base(2, "1.1", 10, 20)],
      [atual(3, "1.1", 0, 10), atual(4, "1.1", 10, 20)],
    );
    expect(resultado.resumo).toMatchObject({ novas: 2, removidas: 2, iguais: 0 });
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
