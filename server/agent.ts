import { ENV } from "./_core/env";

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentProjectContext = {
  project: {
    code: string;
    name: string;
    location: string;
    status: string;
    progress: number;
    plannedStart: Date | string;
    plannedFinish: Date | string;
  };
  activities: Array<{
    wbsCode: string;
    name: string;
    phase: string;
    startOffset: number;
    durationDays: number;
    progress: number;
    status: string;
    critical: number;
  }>;
  workspace?: {
    activeSection: string;
    activeSubtab?: "gantt" | "table" | "lob";
    selectedActivityId?: number;
    contextMode: "focused" | "full";
  };
};

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 6_000;
const REQUEST_TIMEOUT_MS = 45_000;

function resolveEndpoint() {
  const base = ENV.aiApiUrl || ENV.forgeApiUrl;
  if (!base) return null;
  const normalized = base.replace(/\/$/, "");
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

function resolveApiKey() {
  return ENV.aiApiKey || ENV.forgeApiKey;
}

function resolveModel() {
  return ENV.aiModel || "gpt-5-mini";
}

function formatContext(context: AgentProjectContext) {
  const { project, activities } = context;
  const activityLines = activities
    .slice(0, 120)
    .map(activity =>
      [
        activity.wbsCode,
        activity.name,
        activity.phase,
        activity.status,
        `${activity.progress}%`,
        `${activity.durationDays} dias`,
        activity.critical ? "crítica" : "não crítica",
      ].join(" | ")
    )
    .join("\n");

  return [
    `Obra: ${project.code} — ${project.name}`,
    `Local: ${project.location}`,
    `Status: ${project.status}`,
    `Avanço informado: ${project.progress}%`,
    `Início planejado: ${new Date(project.plannedStart).toISOString().slice(0, 10)}`,
    `Término planejado: ${new Date(project.plannedFinish).toISOString().slice(0, 10)}`,
    "Atividades (WBS | nome | fase | status | avanço | duração | criticidade):",
    activityLines || "Nenhuma atividade cadastrada.",
  ].join("\n");
}

function extractContent(payload: any) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (part: any) => part?.type === "text" && typeof part.text === "string"
      )
      .map((part: any) => part.text)
      .join("\n");
  }
  return "Não consegui obter uma resposta textual do provedor de IA.";
}

export async function runProjectAgent(
  context: AgentProjectContext,
  messages: AgentMessage[]
) {
  if (messages.length < 1 || messages.length > MAX_MESSAGES) {
    throw new Error(`A conversa deve ter entre 1 e ${MAX_MESSAGES} mensagens.`);
  }
  if (
    messages.some(
      message =>
        message.content.trim().length === 0 ||
        message.content.length > MAX_MESSAGE_CHARS
    )
  ) {
    throw new Error(
      `Cada mensagem deve ter entre 1 e ${MAX_MESSAGE_CHARS} caracteres.`
    );
  }

  const endpoint = resolveEndpoint();
  const apiKey = resolveApiKey();
  if (!endpoint || !apiKey) {
    throw new Error(
      "Agente de IA não configurado. Defina AI_API_BASE_URL e AI_API_KEY no Render."
    );
  }

  const system = [
    "Você é o Agente de Planejamento da Plataforma Obras.",
    "Responda em português do Brasil, de forma objetiva e operacional.",
    "Use os conceitos de EAP, linha de base, precedências, caminho crítico, folgas, medição, produtividade, restrições e Linha de Balanço.",
    "Não invente medições, custos, contratos ou datas que não estejam no contexto.",
    "Quando faltar dado, diga exatamente qual registro deve ser lançado para permitir a análise.",
    "Priorize decisões rastreáveis: evidência, impacto, responsável, prazo e próxima ação.",
    "Contexto atual da obra:\n" + formatContext(context),
  ].join("\n\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(ENV.publicAppUrl ? { "HTTP-Referer": ENV.publicAppUrl } : {}),
        "X-Title": "Plataforma Obras — Agente de Planejamento",
      },
      body: JSON.stringify({
        model: resolveModel(),
        temperature: 0.2,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Provedor de IA respondeu ${response.status}: ${errorText.slice(0, 500)}`
      );
    }

    const payload = await response.json();
    return {
      content: extractContent(payload),
      model: payload?.model || resolveModel(),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "O provedor de IA excedeu o tempo limite de 45 segundos."
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
