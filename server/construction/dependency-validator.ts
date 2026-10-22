import type {
  ScheduleEvidenceActivity,
  ScheduleEvidenceDependency,
} from "./domain-types";
import type { ValidationIssue } from "./eap-validator";

export type DependencyValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

type NetworkBlock = {
  ids: string[];
  /** Nome da primeira atividade do bloco, para o engenheiro reconhecer onde ele começa. */
  label: string;
};

type NetworkShape = {
  components: number;
  isolated: string[];
  blocks: NetworkBlock[];
};

/**
 * Conta os componentes conexos da rede de atividades.
 *
 * `edges` é o grafo dirigido já montado (predecessor -> sucessores). Tratamos a
 * dependência como não-dirigida para conectividade: A->B e B->A elegem as duas
 * ao mesmo componente, que é a leitura que interessa para "a rede é uma só?".
 */
function networkComponents(
  activities: ScheduleEvidenceActivity[],
  edges: Map<string, string[]>
): NetworkShape {
  // Ordena por id numérico para que a mesma rede produza sempre os mesmos
  // blocos na mesma ordem — mensagem de erro que muda a cada recálculo não
  // serve para o engenheiro acompanhar o que já corrigiu.
  const ids = activities
    .map(activity => String(activity.id))
    .sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b));
  const nomes = new Map(
    activities.map(activity => [String(activity.id), activity.name?.trim() || String(activity.id)])
  );
  const undirected = new Map<string, string[]>();
  for (const id of ids) undirected.set(id, []);
  for (const [from, targets] of edges) {
    for (const to of targets) {
      if (!undirected.has(from) || !undirected.has(to)) continue;
      undirected.get(from)!.push(to);
      undirected.get(to)!.push(from);
    }
  }

  const seen = new Set<string>();
  let components = 0;
  const isolated: string[] = [];
  const blocks: NetworkBlock[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    components += 1;
    const stack = [id];
    seen.add(id);
    const ids2 = new Set<string>();
    while (stack.length) {
      const current = stack.pop()!;
      ids2.add(current);
      for (const neighbour of undirected.get(current) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        stack.push(neighbour);
      }
    }
    // Componente com uma única atividade é uma atividade sem nenhuma ligação:
    // o caso mais grave, porque não é nem cadeia truncada — é atividade avulsa
    // que entra no CPM como se começasse no dia zero da obra.
    if (ids2.size === 1) isolated.push(id);
    const ordenado = Array.from(ids2).sort(
      (a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b)
    );
    blocks.push({ ids: ordenado, label: nomes.get(ordenado[0]) ?? ordenado[0] });
  }

  return { components, isolated, blocks };
}

export function validateDependencies(
  activities: ScheduleEvidenceActivity[],
  dependencies: ScheduleEvidenceDependency[]
): DependencyValidationResult {
  const issues: ValidationIssue[] = [];
  const byId = new Map(
    activities.map(activity => [String(activity.id), activity])
  );
  const edges = new Map<string, string[]>();
  const incoming = new Map<string, number>();

  for (const activity of activities) incoming.set(String(activity.id), 0);

  for (const dependency of dependencies) {
    const predecessorId = String(dependency.predecessorId);
    const successorId = String(dependency.successorId);
    const entityRef = `${predecessorId}→${successorId}`;
    const predecessor = byId.get(predecessorId);
    const successor = byId.get(successorId);

    if (!predecessor || !successor) {
      issues.push({
        code: "missing_dependency_activity",
        severity: "error",
        message: `Dependência aponta para atividade inexistente: ${entityRef}.`,
        entityRef,
      });
      continue;
    }
    if (predecessor.projectId !== successor.projectId) {
      issues.push({
        code: "cross_project_dependency",
        severity: "error",
        message: `Dependência cruza projetos: ${entityRef}.`,
        entityRef,
      });
    }
    if (
      dependency.projectId !== predecessor.projectId ||
      dependency.projectId !== successor.projectId
    ) {
      issues.push({
        code: "dependency_project_mismatch",
        severity: "error",
        message: `Dependência ${entityRef} não pertence ao mesmo projeto das atividades.`,
        entityRef,
      });
    }
    if (predecessorId === successorId) {
      issues.push({
        code: "self_dependency",
        severity: "error",
        message: `Atividade depende de si mesma: ${predecessorId}.`,
        entityRef: predecessorId,
      });
      continue;
    }
    if (!Number.isInteger(dependency.lag)) {
      issues.push({
        code: "invalid_dependency_lag",
        severity: "error",
        message: `Lag da dependência ${entityRef} deve ser inteiro.`,
        entityRef,
      });
    }
    edges.set(predecessorId, [
      ...(edges.get(predecessorId) ?? []),
      successorId,
    ]);
    incoming.set(successorId, (incoming.get(successorId) ?? 0) + 1);
  }

  const queue = Array.from(incoming.entries())
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort();
  let visited = 0;
  while (queue.length) {
    const current = queue.shift()!;
    visited += 1;
    for (const successor of edges.get(current) ?? []) {
      const count = (incoming.get(successor) ?? 0) - 1;
      incoming.set(successor, count);
      if (count === 0) queue.push(successor);
    }
    queue.sort();
  }
  if (visited < activities.length) {
    issues.push({
      code: "dependency_cycle",
      severity: "error",
      message: "A rede de dependências possui ciclo.",
    });
  }

  // Rede desconectada: um CPM só produz caminho crítico confiável se a rede
  // for um único componente conexo. Sem esta checagem, atividades separadas
  // numa rede que não se encontra mais calculam ES/EF/folga como se cada
  // ilha fosse a obra inteira — o resultado sai aritmeticamente correto e
  // conceitualmente errado, que é a pior falha possível num cronograma:
  // não há erro para o engenheiro enxergar.
  //
  // A AURORA TESTE é o caso real: 53 atividades, 64 dependências, zero ciclos,
  // zero referências inválidas — e ainda assim a rede se quebra em 8
  // componentes, com "Demolições" (ES=0) rodando em paralelo de "Limpeza"
  // (ES=248) que deveriam vir antes.
  if (!issues.some(issue => issue.code === "dependency_cycle")) {
    const connected = networkComponents(activities, edges);
    if (connected.components > 1) {
      // A mensagem anterior dizia só "5 componentes" e, quando nenhum bloco era
      // de uma atividade só, imprimia "Atividades isoladas: ." — o engenheiro
      // lia um erro que não lhe dizia nada sobre onde mexer. Agora cada bloco
      // aparece com o nome da atividade em que começa e o tamanho.
      const blocos = [...connected.blocks].sort(
        (a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label)
      );
      const amostra = blocos
        .slice(0, 4)
        .map(
          (bloco, indice) =>
            `${indice + 1}) ${bloco.label} (${bloco.ids.length} ` +
            `${bloco.ids.length === 1 ? "atividade" : "atividades"})`
        )
        .join("; ");
      const restantes = blocos.length > 4 ? ` e mais ${blocos.length - 4}` : "";
      const avulsas =
        connected.isolated.length > 0
          ? ` Além disso, ${connected.isolated.length} atividade(s) não têm nenhuma ligação: ` +
            `${connected.isolated
              .slice(0, 5)
              .map(id => blocos.find(bloco => bloco.ids.includes(id))?.label ?? id)
              .join(", ")}.`
          : "";
      issues.push({
        code: "disconnected_network",
        severity: "error",
        message:
          `A rede de dependências está desconectada em ${connected.components} blocos separados: ` +
          `${amostra}${restantes}. Cada bloco calcula o CPM como se começasse no dia zero da obra, ` +
          `então o caminho crítico reflete apenas um deles.${avulsas} ` +
          `Vincule o último item de um bloco ao primeiro do seguinte, na ordem da EAP, e recalcule.`,
        entityRef: blocos[0]?.ids[0],
      });
    }
  }

  return { valid: !issues.some(issue => issue.severity === "error"), issues };
}
