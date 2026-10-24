/**
 * Contratos de saída estruturada da IA.
 * Toda resposta do Arquimedes deve seguir um schema definido.
 */
import { z } from "zod";

export const EvidenceSchema = z.object({
  source: z.enum(["local_db", "mcp_eap", "mcp_cronograma", "mcp_gantt_lob", "memory", "user_input"]),
  toolName: z.string().optional(),
  data: z.unknown().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

export const FindingSchema = z.object({
  category: z.string(),
  description: z.string(),
  severity: z.enum(["blocker", "warning", "info"]),
  evidence: z.array(EvidenceSchema).default([]),
  recommendation: z.string().optional(),
});

export const ActionSchema = z.object({
  type: z.enum(["create", "update", "delete", "approve", "reject", "none"]),
  target: z.string(),
  description: z.string(),
  requiresConfirmation: z.boolean().default(true),
});

export const ArquimedesResponseSchema = z.object({
  taskId: z.string(),
  content: z.string(),
  model: z.string(),
  provider: z.string(),
  iterations: z.number().int().min(0),
  readOnly: z.boolean(),
  status: z.enum(["respondido", "erro", "pendente"]),
  evidence: z.array(EvidenceSchema).default([]),
  findings: z.array(FindingSchema).default([]),
  actions: z.array(ActionSchema).default([]),
  planUsed: z.boolean().default(false),
  toolsConsulted: z.array(z.string()).default([]),
});

export type ArquimedesResponse = z.infer<typeof ArquimedesResponseSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Action = z.infer<typeof ActionSchema>;

/**
 * Valida a resposta final contra o schema.
 * Retorna { success: true, data } ou { success: false, errors }.
 */
export function validateResponse(response: unknown): { success: true; data: ArquimedesResponse } | { success: false; errors: string[] } {
  const result = ArquimedesResponseSchema.safeParse(response);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`),
  };
}

/**
 * Domínio da ferramenta → fonte da evidência. O domínio diz de onde o dado
 * veio; a fonte é o que a UI e o schema expõem. Ferramentas internas (runtime)
 * e de repositório leem a fonte local.
 */
const AUDIT_SOURCE_BY_DOMAIN: Record<string, Evidence["source"]> = {
  eap: "mcp_eap",
  cronograma: "mcp_cronograma",
  ganttLob: "mcp_gantt_lob",
  runtime: "local_db",
  repository: "local_db",
};

/**
 * Cria uma resposta estruturada a partir do resultado do orquestrador.
 *
 * A evidência é montada do rastro de auditoria (quais ferramentas rodaram e de
 * qual domínio), não do texto do modelo: o "de onde veio" é dado, não opinião.
 */
export function createStructuredResponse(params: {
  taskId: string;
  content: string;
  model: string;
  provider: string;
  iterations: number;
  readOnly: boolean;
  audit: Array<{ event: string; toolName?: string; status?: string; domain?: string }>;
  planUsed?: boolean;
}): Omit<ArquimedesResponse, "status"> & { status: "respondido" } {
  const consulted = params.audit.filter(
    event => event.event === "tool_call" && event.status === "success"
  );
  const toolsConsulted = consulted
    .map(event => event.toolName!)
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 30);
  const evidence: Evidence[] = consulted
    .filter(event => event.toolName)
    .map(event => ({
      source: AUDIT_SOURCE_BY_DOMAIN[event.domain ?? ""] ?? "local_db",
      toolName: event.toolName,
    }))
    .filter(
      (item, index, all) =>
        all.findIndex(other => other.toolName === item.toolName) === index
    )
    .slice(0, 30);

  return {
    taskId: params.taskId,
    content: params.content,
    model: params.model,
    provider: params.provider,
    iterations: params.iterations,
    readOnly: params.readOnly,
    status: "respondido" as const,
    evidence,
    findings: [],
    actions: [],
    planUsed: params.planUsed ?? false,
    toolsConsulted,
  };
}
