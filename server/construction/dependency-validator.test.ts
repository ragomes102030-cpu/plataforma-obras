import { describe, expect, it } from "vitest";
import { validateDependencies } from "./dependency-validator";
import type {
  ScheduleEvidenceActivity,
  ScheduleEvidenceDependency,
} from "./domain-types";

function activity(id: string, projectId = 1): ScheduleEvidenceActivity {
  return {
    id,
    projectId,
    externalId: id,
    eapRef: "1.1",
    wbsCode: "1.1",
    name: id,
    phase: "Execução",
    startOffset: 0,
    durationDays: 1,
    progress: 0,
    status: "Não iniciado",
    critical: 0,
    sortOrder: 1,
  };
}

function dependency(
  predecessorId: string,
  successorId: string
): ScheduleEvidenceDependency {
  return {
    id: `${predecessorId}-${successorId}`,
    projectId: 1,
    externalId: null,
    predecessorId,
    successorId,
    type: "FS",
    lag: 0,
  };
}

describe("validateDependencies", () => {
  it("aceita uma rede linear", () => {
    const result = validateDependencies(
      [activity("A"), activity("B"), activity("C")],
      [dependency("A", "B"), dependency("B", "C")]
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejeita atividade inexistente e auto dependência", () => {
    const result = validateDependencies(
      [activity("A")],
      [dependency("A", "A"), dependency("A", "B")]
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code).sort()).toEqual(
      ["missing_dependency_activity", "self_dependency"].sort()
    );
  });

  it("rejeita ciclo e dependência cruzando projetos", () => {
    const result = validateDependencies(
      [activity("A", 1), activity("B", 1), activity("C", 2)],
      [dependency("A", "B"), dependency("B", "A"), dependency("A", "C")]
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code).sort()).toEqual(
      [
        "cross_project_dependency",
        "dependency_project_mismatch",
        "dependency_cycle",
      ].sort()
    );
  });

  it("rejeita rede desconectada: activities em cadeias isoladas", () => {
    // Reproduz o defeito real da AURORA TESTE (OB-PUPOCN): 53 atividades cuja
    // rede se quebra em 8 componentes. Nenhum ciclo existe, nenhuma referência
    // está inválida — e ainda assim o "caminho crítico" que sai daqui é o de
    // uma das 8 metades, não o da obra. Uma rede que o CPM não consegue ler
    // inteira não é uma rede válida.
    const activities = [
      activity("A"),
      activity("B"),
      activity("C"),
      activity("D"),
      activity("E"),
      activity("F"),
    ];
    const result = validateDependencies(activities, [
      dependency("A", "B"),
      dependency("B", "C"),
      dependency("D", "E"),
      dependency("E", "F"),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toContain(
      "disconnected_network"
    );
    expect(result.issues[0].severity).toBe("error");
    expect(result.issues[0].message).toContain("2");
    // A mensagem tem de dizer ONDE mexer. "5 componentes separados" não ajuda
    // ninguém a achar o elo que falta; o nome da atividade em que cada bloco
    // começa, sim.
    expect(result.issues[0].message).toContain("A (3 atividades)");
    expect(result.issues[0].message).toContain("D (3 atividades)");
    expect(result.issues[0].message).not.toContain("Atividades isoladas: .");
  });

  it("descreve os blocos na mesma ordem, mesmo com a entrada embaralhada", () => {
    // O engenheiro corrige um elo por vez e recalcula. Se a numeração dos
    // blocos dançar entre um recálculo e outro, ele perde a referência do que
    // já arrumou.
    const ordenadas = [activity("A"), activity("B"), activity("C"), activity("D")];
    const ligacoes = [dependency("A", "B"), dependency("C", "D")];
    const primeira = validateDependencies(ordenadas, ligacoes).issues[0].message;
    const segunda = validateDependencies([...ordenadas].reverse(), ligacoes).issues[0]
      .message;

    expect(segunda).toBe(primeira);
  });

  it("rejeita atividade isolada sem nenhuma ligação", () => {
    const result = validateDependencies(
      [activity("A"), activity("B"), activity("ORFA")],
      [dependency("A", "B")]
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toContain(
      "disconnected_network"
    );
    // Atividade avulsa tem de ser nomeada: é o caso mais fácil de corrigir e o
    // mais fácil de passar despercebido num total de "3 componentes".
    expect(result.issues[0].message).toContain("ORFA");
    expect(result.issues[0].message).toContain("não têm nenhuma ligação");
  });

  it("aceita rede única a partir de uma raiz, com TTIs paralelas legítimas", () => {
    // Sobreposição é legítima em obra: duas frentes independentes que
    // partem do mesmo marco. Isso continua válido — só rede *desligada* é erro.
    const result = validateDependencies(
      [activity("A"), activity("B"), activity("C"), activity("D")],
      [dependency("A", "B"), dependency("A", "C"), dependency("B", "D")]
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
