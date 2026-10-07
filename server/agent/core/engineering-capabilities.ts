export type DurationEvidenceInput = {
  durationDays?: number;
  plannedQuantity?: number;
  productivity?: number;
  quantityUnit?: string;
  productivityUnit?: string;
  source?: string | null;
};

export function calculateActivityDuration(input: DurationEvidenceInput) {
  if (input.durationDays !== undefined) {
    if (!Number.isInteger(input.durationDays) || input.durationDays <= 0) {
      throw new Error("A duração informada deve ser um inteiro positivo.");
    }
    return {
      durationDays: input.durationDays,
      method: "engineer_informed",
      evidenceLevel: "engineer_informed",
      premise: "duração informada pelo engenheiro/planejamento",
      source: input.source ?? null,
    };
  }

  if (!(input.plannedQuantity! > 0) || !(input.productivity! > 0)) {
    throw new Error("Para calcular a duração são necessárias quantidade e produtividade positivas.");
  }

  const quantityUnit = input.quantityUnit?.trim().toLowerCase();
  const productivityUnit = input.productivityUnit?.trim().toLowerCase();
  if (quantityUnit && productivityUnit && quantityUnit !== productivityUnit) {
    throw new Error("Unidades incompatíveis; o Arquimedes não fará conversão automática sem regra de conversão validada.");
  }

  const durationDays = Math.max(1, Math.ceil(input.plannedQuantity! / input.productivity!));
  return {
    durationDays,
    method: "ceil(quantidade/produtividade)",
    evidenceLevel: input.source?.trim() ? "source_supported" : "engineer_informed",
    premise: "produtividade expressa na unidade da quantidade por dia para a equipe considerada",
    source: input.source ?? null,
    inputs: {
      plannedQuantity: input.plannedQuantity,
      productivity: input.productivity,
      quantityUnit: input.quantityUnit ?? null,
      productivityUnit: input.productivityUnit ?? null,
    },
  };
}

export type DependencyInput = { id: string; predecessor: string; successor: string };

export function validateDependencyNetwork(dependencies: DependencyInput[]) {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();

  for (const dep of dependencies) {
    if (!dep.predecessor || !dep.successor) {
      throw new Error("Toda dependência precisa de predecessor e sucessor.");
    }
    nodes.add(dep.predecessor);
    nodes.add(dep.successor);
    const edges = adjacency.get(dep.predecessor) ?? [];
    edges.push(dep.successor);
    adjacency.set(dep.predecessor, edges);
  }

  const state = new Map<string, 0 | 1 | 2>();
  const cycle: string[] = [];
  const visit = (node: string): boolean => {
    state.set(node, 1);
    for (const next of adjacency.get(node) ?? []) {
      const nextState = state.get(next) ?? 0;
      if (nextState === 1) {
        cycle.push(node, next);
        return true;
      }
      if (nextState === 0 && visit(next)) {
        cycle.unshift(node);
        return true;
      }
    }
    state.set(node, 2);
    return false;
  };

  for (const node of nodes) {
    if ((state.get(node) ?? 0) === 0 && visit(node)) {
      return { valid: false, nodeCount: nodes.size, dependencyCount: dependencies.length, cycle };
    }
  }

  return {
    valid: true,
    nodeCount: nodes.size,
    dependencyCount: dependencies.length,
    cycle: [],
    rule: "rede acíclica; uma atividade não pode depender de si mesma nem formar ciclo",
  };
}
