import { describe, expect, it } from "vitest";
import {
  buildEapResolutionPlan,
  findUncoveredEapResolutionGroups,
} from "./eap-resolution-engine";

describe("eap-resolution-engine", () => {
  const nodes = [
    {
      code: "1.1",
      nodeId: 10,
      name: "Serviços",
      parentCode: "1",
      description: "Serviços gerais.",
      inclusions: "Execução e controle.",
      exclusions: "Atividades fora do escopo.",
      responsible: "Equipe A",
      acceptanceCriteria: "Aprovado.",
    },
    {
      code: "1.1.1",
      nodeId: 11,
      name: "Mobilização",
      parentCode: "1.1",
      description: "Mobilização.",
      inclusions: "Mobilização e organização do canteiro.",
      exclusions: "Administração permanente.",
      responsible: null,
      acceptanceCriteria: "Canteiro mobilizado.",
    },
    {
      code: "1.1.2",
      nodeId: 12,
      name: "Administração",
      parentCode: "1.1",
      description: "Administração.",
      inclusions: "Organização do canteiro.",
      exclusions: "Mobilização inicial.",
      responsible: null,
      acceptanceCriteria: null,
    },
  ];

  it("agrupa sobreposição entre irmãos em um problema de engenharia", () => {
    const plan = buildEapResolutionPlan(nodes, [{
      code: "eap_scope_overlap_evidence",
      message: "Há evidência textual de sobreposição entre os irmãos 1.1.1 e 1.1.2 de 1.1. Revise inclusões e exclua responsabilidades duplicadas.",
      entityRef: "10",
    }]);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      kind: "scope_overlap",
      parentCode: "1.1",
      affectedCodes: ["1.1.1", "1.1.2"],
      issueCount: 1,
    });
  });

  it("consolida vários conflitos de irmãos no mesmo grupo do pai", () => {
    const plan = buildEapResolutionPlan(nodes, [
      {
        code: "eap_scope_overlap_evidence",
        message: "Há evidência textual de sobreposição entre os irmãos 1.1.1 e 1.1.2 de 1.1. Revise inclusões.",
        entityRef: "10",
      },
      {
        code: "eap_scope_overlap_evidence",
        message: "Há evidência textual de sobreposição entre os irmãos 1.1.1 e 1.1.3 de 1.1. Revise inclusões.",
        entityRef: "10",
      },
    ]);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.affectedCodes).toEqual(["1.1.1", "1.1.2", "1.1.3"]);
    expect(plan[0]?.issueCount).toBe(2);
  });

  it("separa falta de responsável como decisão pendente", () => {
    const plan = buildEapResolutionPlan(nodes, [{
      code: "eap_leaf_not_ready",
      message: "Folha 1.1.1 (Mobilização) ainda não está pronta: falta(m) responsável.",
      entityRef: "11",
    }]);

    expect(plan[0]?.kind).toBe("missing_dictionary");
    expect(plan[0]?.unresolvedDecisions).toHaveLength(1);
  });

  it("detecta grupo de sobreposição sem atualização concreta", () => {
    const plan = buildEapResolutionPlan(nodes, [{
      code: "eap_scope_overlap_evidence",
      message: "Há evidência textual de sobreposição entre os irmãos 1.1.1 e 1.1.2 de 1.1. Revise inclusões.",
      entityRef: "10",
    }]);

    const uncovered = findUncoveredEapResolutionGroups(plan, []);

    expect(uncovered).toHaveLength(1);
    expect(uncovered[0]?.id).toBe(plan[0]?.id);
  });

  it("considera coberto quando há atualização de escopo", () => {
    const plan = buildEapResolutionPlan(nodes, [{
      code: "eap_scope_overlap_evidence",
      message: "Há evidência textual de sobreposição entre os irmãos 1.1.1 e 1.1.2 de 1.1. Revise inclusões.",
      entityRef: "10",
    }]);

    const uncovered = findUncoveredEapResolutionGroups(plan, [{
      operation: "update",
      nodeId: 11,
      inclusions: "Mobilização inicial e organização do canteiro, sem administração permanente.",
      exclusions: "Administração permanente do canteiro.",
    }]);

    expect(uncovered).toHaveLength(0);
  });

  it("consolida folhas sem responsável por pai", () => {
    const plan = buildEapResolutionPlan(nodes, [
      {
        code: "eap_leaf_not_ready",
        message: "Folha 1.1.1 (Mobilização) ainda não está pronta: falta(m) responsável.",
        entityRef: "11",
      },
      {
        code: "eap_leaf_not_ready",
        message: "Folha 1.1.2 (Administração) ainda não está pronta: falta(m) responsável.",
        entityRef: "12",
      },
    ]);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.kind).toBe("missing_dictionary");
    expect(plan[0]?.parentCode).toBe("1.1");
    expect(plan[0]?.affectedCodes).toEqual(["1.1.1", "1.1.2"]);
    expect(plan[0]?.issueCount).toBe(2);
  });
});
