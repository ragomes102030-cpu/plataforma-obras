/**
 * Auditoria de uma versão aprovada: APENAS LEITURA.
 * O banco local governa o planejamento; os três MCPs públicos calculam
 * em memória e não conhecem project_id nem persistem dados da obra.
 */
import { extractMcpText, type McpCallResult } from "./mcp-client";
import type { ConstructionMcpDomain } from "./construction-mcps";

export type ApprovedSnapshot = {
  nodes: Array<{ id: number; code: string; parentId: number | null; level: number }>;
  activities: Array<{
    id: number; durationDays: number; earlyStart: number | null;
    earlyFinish: number | null; lateStart: number | null; lateFinish: number | null;
    totalFloat: number | null; freeFloat: number | null; critical: boolean;
  }>;
  dependencies: Array<{ predecessorId: number; successorId: number; type: string; lag: number }>;
  lobRows: number;
  activitiesWithResourceAllocations: number;
};

export type ReadOnlyAuditClients = Record<ConstructionMcpDomain, {
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpCallResult>;
}>;

function decode(response: McpCallResult): Record<string, unknown> {
  if (response.isError === true) throw new Error("MCP sinalizou erro no conteúdo da chamada.");
  const raw = extractMcpText(response).trim();
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : response.structuredContent;
  } catch {
    throw new Error("MCP retornou resultado sem JSON válido.");
  }
  if (!data || Array.isArray(data) || typeof data !== "object") {
    throw new Error("MCP retornou resultado sem objeto estruturado.");
  }
  const object = data as Record<string, unknown>;
  if (object.ok === false || object.valid === false || object.persistido !== false) {
    throw new Error("MCP rejeitou cálculo ou não declarou persistido=false.");
  }
  return object;
}

export async function auditApprovedSnapshot(
  snapshot: ApprovedSnapshot,
  clients: ReadOnlyAuditClients
) {
  if (!snapshot.nodes.length || !snapshot.activities.length) {
    throw new Error("A versão aprovada não contém EAP e atividades para auditar.");
  }
  if (snapshot.nodes.length > 2000 || snapshot.activities.length > 2000 ||
      snapshot.dependencies.length > 10000) {
    throw new Error("A versão excede o limite contratado dos MCPs públicos.");
  }
  const byNodeId = new Map(snapshot.nodes.map(node => [node.id, node]));
  if (byNodeId.size !== snapshot.nodes.length ||
      new Set(snapshot.nodes.map(node => node.code)).size !== snapshot.nodes.length) {
    throw new Error("Nós da EAP com IDs ou códigos duplicados.");
  }
  const byActivityId = new Map(snapshot.activities.map(a => [a.id, a]));
  if (byActivityId.size !== snapshot.activities.length ||
      snapshot.activities.some(a => !Number.isInteger(a.durationDays) || a.durationDays <= 0)) {
    throw new Error("Atividades duplicadas ou com durações inválidas.");
  }
  if (snapshot.dependencies.some(d => !byActivityId.has(d.predecessorId) ||
      !byActivityId.has(d.successorId))) {
    throw new Error("Existem dependências fora da versão aprovada.");
  }

  const eapNodes = snapshot.nodes.map(node => ({
    eap_id: node.code,
    parent_id: node.parentId == null ? null : byNodeId.get(node.parentId)?.code ?? null,
    nivel: node.level,
  }));
  if (snapshot.nodes.some(node => node.parentId != null && !byNodeId.has(node.parentId))) {
    throw new Error("EAP com referência ao pai fora da versão aprovada.");
  }
  const activityArgs = snapshot.activities.map(a => ({
    id: String(a.id), duracao_dias: a.durationDays,
  }));
  const dependencyArgs = snapshot.dependencies.map(d => ({
    predecessora_id: String(d.predecessorId), sucessora_id: String(d.successorId),
    tipo: d.type, lag_dias: d.lag,
  }));

  const [eapResult, cpmResult] = await Promise.allSettled([
    clients.eap.callTool("validar_estrutura_eap", { nos: eapNodes }),
    clients.cronograma.callTool("calcular_cpm_com_evidencia", {
      atividades: activityArgs, dependencias: dependencyArgs,
    }),
  ]);
  let eap: { status: "passed" | "failed"; count: number; errors: string[] } = {
    status: "failed", count: snapshot.nodes.length, errors: [],
  };
  if (eapResult.status === "fulfilled") {
    try {
      const parsed = decode(eapResult.value);
      if (parsed.ok !== true || parsed.total_nos !== snapshot.nodes.length ||
          !Array.isArray(parsed.erros) || parsed.erros.length > 0) {
        throw new Error("Quantidade de nós ou integridade EAP incompatível.");
      }
      eap = { status: "passed", count: snapshot.nodes.length, errors: [] };
    } catch (error) { eap.errors.push(error instanceof Error ? error.message : "Falha EAP"); }
  } else eap.errors.push("Consulta MCP EAP indisponível.");

  let cpm: { status: "passed" | "failed"; count: number; compared: number;
    differences: Array<{ id: number; fields: string[] }>; error: string | null } = {
    status: "failed", count: snapshot.activities.length, compared: 0,
    differences: [], error: null,
  };
  if (cpmResult.status === "fulfilled") {
    try {
      const parsed = decode(cpmResult.value);
      if (parsed.valid !== true || !Array.isArray(parsed.atividades) ||
          parsed.atividades.length !== snapshot.activities.length) {
        throw new Error("Rede CPM inválida ou número de atividades divergente.");
      }
      const results = new Map((parsed.atividades as Array<Record<string, unknown>>)
        .map(activity => [String(activity.id), activity]));
      if (results.size !== snapshot.activities.length) {
        throw new Error("CPM contém resultados duplicados ou ausentes.");
      }
      const attributes = [
        ["earlyStart", "ES"], ["earlyFinish", "EF"],
        ["lateStart", "LS"], ["lateFinish", "LF"],
        ["totalFloat", "folga_total"], ["freeFloat", "folga_livre"],
      ] as const;
      const differences = snapshot.activities.map(activity => {
        const got = results.get(String(activity.id));
        if (!got) return { id: activity.id, fields: ["atividade_ausente"] };
        const fields = attributes.filter(([left, right]) => {
          const stored = activity[left];
          return stored == null || !Number.isFinite(Number(got[right])) ||
            Math.abs(Number(stored) - Number(got[right])) > 1e-6;
        }).map(([left]) => left as string);
        if (Boolean(got.critica) !== activity.critical) fields.push("critical");
        return { id: activity.id, fields };
      }).filter(item => item.fields.length);
      cpm = { status: differences.length ? "failed" : "passed",
        count: snapshot.activities.length, compared: snapshot.activities.length,
        differences, error: null };
    } catch (error) { cpm.error = error instanceof Error ? error.message : "Falha CPM"; }
  } else cpm.error = "Consulta MCP Cronograma indisponível.";

  return {
    readOnly: true as const,
    eap, cpm,
    lob: {
      status: "pending" as const,
      associations: snapshot.lobRows,
      allocatedActivities: snapshot.activitiesWithResourceAllocations,
      reason: "Paridade de datas da LOB requer equipes, ritmos e restrições reais por atividade-local.",
    },
  };
}
