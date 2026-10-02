import { describe, expect, it } from "vitest";
import { buildEapResolutionPlan } from "./eap-resolution-engine";

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
    });
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
});
