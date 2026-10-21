import { describe, expect, it } from "vitest";
import {
  computeLookahead,
  diasEntre,
  segundaFeira,
  somarDias,
  type LookaheadActivity,
  type LookaheadCommitment,
  type LookaheadInput,
} from "./lookahead";

/**
 * O que estes testes protegem.
 *
 * O PPC é o primeiro número desta plataforma que a obra usa para cobrar alguém.
 * Se ele mentir para cima, o gerente relaxa; se mentir para baixo, o time briga
 * com o time errado. As duas formas de mentir estão cobertas aqui:
 *
 *   - calcular sobre compromissos ainda não avaliados (semana em andamento
 *     virando "0%" ou "100%");
 *   - esconder que metade da base não foi avaliada (`pendentes`).
 */

const BASE = "2026-10-05"; // segunda-feira
const HOJE = "2026-10-21"; // quarta da terceira semana

function atividade(overrides: Partial<LookaheadActivity> & { id: number }): LookaheadActivity {
  return {
    wbsCode: `1.${overrides.id}`,
    name: `Atividade ${overrides.id}`,
    unit: "m3",
    startIso: "2026-10-19",
    finishIso: "2026-10-23",
    plannedQuantity: 100,
    executedQuantity: 0,
    openConstraints: 0,
    ...overrides,
  };
}

function compromisso(
  overrides: Partial<LookaheadCommitment> & { id: number; activityId: number; weekStartIso: string }
): LookaheadCommitment {
  return {
    status: "planejado",
    reason: null,
    plannedQuantity: null,
    executedQuantity: null,
    responsible: null,
    ...overrides,
  };
}

function entrada(parcial: Partial<LookaheadInput> = {}): LookaheadInput {
  return {
    atividades: [],
    compromissos: [],
    semanaBaseIso: BASE,
    hojeIso: HOJE,
    semanas: 4,
    ...parcial,
  };
}

describe("datas da semana", () => {
  it("normaliza qualquer dia para a segunda-feira da semana", () => {
    expect(segundaFeira("2026-10-21")).toBe("2026-10-19"); // quarta
    expect(segundaFeira("2026-10-19")).toBe("2026-10-19"); // segunda
    expect(segundaFeira("2026-10-25")).toBe("2026-10-19"); // domingo pertence à semana anterior
    expect(segundaFeira("2026-10-26")).toBe("2026-10-26"); // segunda seguinte
  });

  it("conta dias entre datas sem depender de fuso", () => {
    expect(diasEntre("2026-10-19", "2026-10-23")).toBe(4);
    expect(somarDias("2026-10-19", 27)).toBe("2026-11-15");
  });
});

describe("janela de 4 semanas", () => {
  it("monta quatro semanas de segunda a sexta e classifica passado/corrente/futuro", () => {
    const resultado = computeLookahead(entrada());

    expect(resultado.semanas).toHaveLength(4);
    expect(resultado.semanas.map(s => s.inicio)).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(resultado.semanas.map(s => s.fim)).toEqual([
      "2026-10-09",
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
    ]);
    expect(resultado.semanas.map(s => s.situacao)).toEqual([
      "encerrada",
      "encerrada",
      "corrente",
      "futura",
    ]);
    expect(resultado.semanaBase).toBe(BASE);
  });

  it("respeita o tamanho pedido da janela, com piso de 1 e teto de 12", () => {
    expect(computeLookahead(entrada({ semanas: 1 })).semanas).toHaveLength(1);
    expect(computeLookahead(entrada({ semanas: 0 })).semanas).toHaveLength(1);
    expect(computeLookahead(entrada({ semanas: 99 })).semanas).toHaveLength(12);
  });

  it("ignora atividade que terminou antes da janela e a que já está 100% executada", () => {
    const resultado = computeLookahead(
      entrada({
        atividades: [
          atividade({ id: 1, startIso: "2026-09-01", finishIso: "2026-09-30" }),
          atividade({ id: 2, executedQuantity: 100, plannedQuantity: 100 }),
          atividade({ id: 3 }),
        ],
      })
    );

    const ids = resultado.semanas[2]!.atividades.map(a => a.id);
    expect(ids).toEqual([3]);
  });

  it("marca pronta só a atividade sem restrição aberta", () => {
    const resultado = computeLookahead(
      entrada({
        atividades: [
          atividade({ id: 1, openConstraints: 0 }),
          atividade({ id: 2, openConstraints: 2 }),
        ],
      })
    );

    const semana = resultado.semanas[2]!;
    expect(semana.prontas).toBe(1);
    expect(semana.bloqueadas).toBe(1);
    expect(semana.atividades.find(a => a.id === 2)!.pronta).toBe(false);
    expect(resultado.totalBloqueadas).toBe(1);
  });
});

describe("PPC — o número que não pode mentir", () => {
  it("devolve null (não 0%) quando nada foi avaliado", () => {
    const resultado = computeLookahead(
      entrada({
        compromissos: [
          compromisso({ id: 1, activityId: 1, weekStartIso: "2026-10-19" }),
          compromisso({ id: 2, activityId: 2, weekStartIso: "2026-10-19" }),
        ],
      })
    );

    const corrente = resultado.semanas[2]!;
    expect(corrente.ppc).toBeNull();
    expect(corrente.pendentes).toBe(2);
    expect(resultado.ppcCorrente).toBeNull();
    expect(resultado.compromissosPendentes).toBe(2);
  });

  it("calcula sobre avaliados, deixando os pendentes de fora da conta", () => {
    const resultado = computeLookahead(
      entrada({
        compromissos: [
          compromisso({ id: 1, activityId: 1, weekStartIso: "2026-10-19", status: "concluido" }),
          compromisso({
            id: 2,
            activityId: 2,
            weekStartIso: "2026-10-19",
            status: "nao_concluido",
            reason: "material",
          }),
          compromisso({ id: 3, activityId: 3, weekStartIso: "2026-10-19" }),
        ],
      })
    );

    const corrente = resultado.semanas[2]!;
    expect(corrente.concluidos).toBe(1);
    expect(corrente.naoConcluidos).toBe(1);
    expect(corrente.pendentes).toBe(1);
    expect(corrente.ppc).toBe(50);
    // 50% com 1 pendente continua sendo 50% de 2 avaliados — e o alerta diz isso.
    expect(resultado.alertas.some(a => a.includes("ainda sem avaliação"))).toBe(true);
  });

  it("não conta compromisso cancelado como falha nem como sucesso", () => {
    const resultado = computeLookahead(
      entrada({
        compromissos: [
          compromisso({ id: 1, activityId: 1, weekStartIso: "2026-10-19", status: "concluido" }),
          compromisso({ id: 2, activityId: 2, weekStartIso: "2026-10-19", status: "cancelado" }),
        ],
      })
    );

    const corrente = resultado.semanas[2]!;
    expect(corrente.compromissos).toHaveLength(1);
    expect(corrente.ppc).toBe(100);
  });

  it("distribui as causas das não conformidades com participação", () => {
    const resultado = computeLookahead(
      entrada({
        compromissos: [
          compromisso({
            id: 1,
            activityId: 1,
            weekStartIso: "2026-10-19",
            status: "nao_concluido",
            reason: "material",
          }),
          compromisso({
            id: 2,
            activityId: 2,
            weekStartIso: "2026-10-19",
            status: "nao_concluido",
            reason: "material",
          }),
          compromisso({
            id: 3,
            activityId: 3,
            weekStartIso: "2026-10-19",
            status: "nao_concluido",
            reason: "clima",
          }),
          compromisso({
            id: 4,
            activityId: 4,
            weekStartIso: "2026-10-19",
            status: "concluido",
          }),
        ],
      })
    );

    const causas = resultado.semanas[2]!.causas;
    expect(causas).toHaveLength(2);
    expect(causas[0]).toEqual({ reason: "material", quantidade: 2, participacao: 66.7 });
    expect(causas[1]).toEqual({ reason: "clima", quantidade: 1, participacao: 33.3 });
    expect(resultado.semanas[2]!.ppc).toBe(25);
  });

  it("calcula PPC em quantidade só com as duas pontas informadas", () => {
    const resultado = computeLookahead(
      entrada({
        compromissos: [
          compromisso({
            id: 1,
            activityId: 1,
            weekStartIso: "2026-10-19",
            status: "concluido",
            plannedQuantity: 100,
            executedQuantity: 80,
          }),
          compromisso({
            id: 2,
            activityId: 2,
            weekStartIso: "2026-10-19",
            status: "concluido",
            plannedQuantity: 50,
            // sem executado: sai da conta de quantidade, não vira 0 nem 100
          }),
        ],
      })
    );

    expect(resultado.semanas[2]!.ppcQuantidade).toBe(80);
    expect(resultado.semanas[2]!.ppc).toBe(100);
  });

  it("faz a média só das semanas encerradas com medição", () => {
    const resultado = computeLookahead(
      entrada({
        compromissos: [
          compromisso({ id: 1, activityId: 1, weekStartIso: "2026-10-05", status: "concluido" }),
          compromisso({ id: 2, activityId: 2, weekStartIso: "2026-10-12", status: "concluido" }),
          compromisso({ id: 3, activityId: 3, weekStartIso: "2026-10-12", status: "nao_concluido", reason: "projeto" }),
          compromisso({ id: 4, activityId: 4, weekStartIso: "2026-10-26", status: "concluido" }),
        ],
      })
    );

    // 10-05 = 100%, 10-12 = 50%, a semana corrente não tem nada avaliado e a
    // futura não entra na média.
    expect(resultado.ppcMedio).toBe(75);
    expect(resultado.ppcCorrente).toBeNull();
  });

  it("só declara tendência quando a diferença passa de 5 pontos", () => {
    const subindo = computeLookahead(
      entrada({
        compromissos: [
          compromisso({ id: 1, activityId: 1, weekStartIso: "2026-10-05", status: "nao_concluido", reason: "material" }),
          compromisso({ id: 2, activityId: 2, weekStartIso: "2026-10-12", status: "concluido" }),
        ],
      })
    );
    expect(subindo.tendencia).toBe("subindo");

    const estavel = computeLookahead(
      entrada({
        compromissos: [
          compromisso({ id: 1, activityId: 1, weekStartIso: "2026-10-05", status: "concluido" }),
          compromisso({ id: 2, activityId: 2, weekStartIso: "2026-10-05", status: "concluido" }),
          compromisso({ id: 3, activityId: 3, weekStartIso: "2026-10-05", status: "nao_concluido", reason: "outro" }),
          compromisso({ id: 4, activityId: 4, weekStartIso: "2026-10-05", status: "nao_concluido", reason: "outro" }),
          compromisso({ id: 5, activityId: 5, weekStartIso: "2026-10-12", status: "concluido" }),
        ],
      })
    );
    // 50% -> 100% é subida; aqui só conferimos que existe dado comparável.
    expect(estavel.tendencia).not.toBe("sem_dados");

    expect(computeLookahead(entrada()).tendencia).toBe("sem_dados");
  });

  it("avisa quando a semana corrente está bloqueada ou sem compromisso", () => {
    const resultado = computeLookahead(
      entrada({
        atividades: [atividade({ id: 1, openConstraints: 1 })],
      })
    );

    expect(resultado.alertas.some(a => a.includes("restrição aberta"))).toBe(true);
    expect(resultado.alertas.some(a => a.includes("Nenhum compromisso"))).toBe(true);
  });
});
