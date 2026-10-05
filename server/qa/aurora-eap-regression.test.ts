import { describe, expect, it } from "vitest";
import {
  validateEap,
  validateWbsCostCoverage,
} from "../construction/eap-validator";
import type { EapEvidenceNode } from "../construction/domain-types";

function buildAuroraEap(): EapEvidenceNode[] {
  const nodes: EapEvidenceNode[] = [
    {
      id: 1,
      projectId: 1,
      externalId: "aurora-root",
      externalUid: "aurora-root",
      parentId: null,
      code: "1",
      name: "Residencial Aurora",
      level: 1,
      nodeType: "grupo",
      unit: null,
      plannedQuantity: null,
      sortOrder: 1,
    },
  ];

  let id = 2;
  let leafIndex = 1;
  for (let groupIndex = 1; groupIndex <= 15; groupIndex++) {
    const groupId = id++;
    const groupCode = `1.${groupIndex}`;
    nodes.push({
      id: groupId,
      projectId: 1,
      externalId: `aurora-${groupCode}`,
      externalUid: `aurora-${groupCode}`,
      parentId: 1,
      code: groupCode,
      name: `Grupo ${groupIndex}`,
      level: 2,
      nodeType: "grupo",
      unit: null,
      plannedQuantity: null,
      sortOrder: groupIndex,
    });

    // 53 package leaves distributed across the 15 level-2 groups:
    // groups 1..8 receive 4 leaves and groups 9..15 receive 3.
    const leavesInGroup = groupIndex <= 8 ? 4 : 3;
    for (let i = 1; i <= leavesInGroup; i++) {
      const code = `${groupCode}.${i}`;
      nodes.push({
        id: id++,
        projectId: 1,
        externalId: `aurora-${code}`,
        externalUid: `aurora-${code}`,
        parentId: groupId,
        code,
        name: `Pacote ${leafIndex++}`,
        level: 3,
        nodeType: "pacote",
        unit: "m²",
        plannedQuantity: 100,
        sortOrder: i,
      });
    }
  }
  return nodes;
}

describe("regressão estrutural Aurora", () => {
  it("reproduz a forma estrutural esperada: 69 nós, 53 folhas e 15 grupos nível 2", () => {
    const nodes = buildAuroraEap();
    const structural = validateEap(nodes);

    expect(nodes).toHaveLength(69);
    expect(nodes.filter(node => node.level === 2)).toHaveLength(15);
    expect(
      nodes.filter(node => node.nodeType === "pacote" && node.level === 3)
    ).toHaveLength(53);
    expect(nodes.filter(node => node.parentId === null)).toHaveLength(1);
    expect(structural.valid).toBe(true);
    expect(structural.issues).toEqual([]);
  });

  it("mantém a relação pai-filho correta e não cria órfãos, ciclos ou códigos duplicados", () => {
    const nodes = buildAuroraEap();
    const byId = new Map(nodes.map(node => [String(node.id), node]));

    for (const node of nodes) {
      if (node.parentId === null) continue;
      const parent = byId.get(String(node.parentId));
      expect(parent).toBeDefined();
      expect(node.level).toBe(parent!.level + 1);
      expect(node.code.startsWith(parent!.code + ".")).toBe(true);
    }

    expect(new Set(nodes.map(node => node.code)).size).toBe(nodes.length);
    expect(
      nodes.some(node => node.nodeType === "pacote" && nodes.some(child => child.parentId === node.id))
    ).toBe(false);
  });

  it("não confunde validade estrutural com cobertura de orçamento dos 53 pacotes", () => {
    const nodes = buildAuroraEap();
    const allLeaves = nodes.filter(
      node => node.nodeType === "pacote" && !nodes.some(child => child.parentId === node.id)
    );

    const complete = validateWbsCostCoverage(
      nodes,
      allLeaves.map(node => ({ wbsNodeId: node.id }))
    );
    expect(complete.valid).toBe(true);
    expect(complete.issues).toEqual([]);

    const incomplete = validateWbsCostCoverage(
      nodes,
      allLeaves.slice(0, 52).map(node => ({ wbsNodeId: node.id }))
    );
    expect(incomplete.valid).toBe(false);
    expect(
      incomplete.issues.filter(issue => issue.code === "wbs_leaf_without_cost")
    ).toHaveLength(1);
  });

  it("detecta dupla contagem quando o grupo também recebe custo direto", () => {
    const nodes = buildAuroraEap();
    const firstGroup = nodes.find(node => node.code === "1.1")!;
    const firstLeaf = nodes.find(node => node.code === "1.1.1")!;

    const result = validateWbsCostCoverage(nodes, [
      { wbsNodeId: firstGroup.id },
      { wbsNodeId: firstLeaf.id },
      ...nodes
        .filter(node => node.nodeType === "pacote" && node.id !== firstLeaf.id)
        .map(node => ({ wbsNodeId: node.id })),
    ]);

    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        issue =>
          issue.code === "wbs_double_counted_cost" &&
          issue.entityRef === String(firstGroup.id)
      )
    ).toBe(true);
  });
});

export { buildAuroraEap };
