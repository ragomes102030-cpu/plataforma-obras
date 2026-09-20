import { trpc } from "@/lib/trpc";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import {
  Bot,
  CircleAlert,
  CircleCheck,
  Database,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";

type AgentSection =
  | "portfolio"
  | "eap"
  | "cronograma"
  | "producao"
  | "medicao"
  | "gantt"
  | "lob"
  | "restricoes"
  | "relatorios";

const sectionLabels: Record<AgentSection, string> = {
  portfolio: "Painel da obra",
  eap: "EAP",
  cronograma: "Cronograma",
  producao: "Produção",
  medicao: "Medição",
  gantt: "Gantt",
  lob: "Linha de Balanço",
  restricoes: "Restrições",
  relatorios: "Relatórios",
};

const stageLabels: Record<string, string> = {
  DESCRITIVO: "Descritivo",
  EAP_PROPOSTA: "EAP em proposta",
  EAP_REVISAO: "EAP em revisão",
  ATIVIDADES_PROPOSTA: "Atividades em proposta",
  DEPENDENCIAS_PROPOSTA: "Dependências em proposta",
  CPM_VALIDADO: "CPM validado",
  CRONOGRAMA_PROPOSTO: "Cronograma em proposta",
  BASELINE_PROPOSTA: "Baseline em proposta",
  GANTT_LOB_PROPOSTO: "Gantt / LOB em proposta",
  CONTROLE: "Controle",
};

const mcpLabels = {
  eap: "EAP",
  cronograma: "Cronograma",
  ganttLob: "Gantt / LOB",
} as const;

export function AgentSidebar({
  projectId,
  projectName,
  activeSection,
  activeSubtab,
  onClose,
}: {
  projectId: number;
  projectName: string;
  activeSection: AgentSection;
  activeSubtab?: "gantt" | "table" | "lob";
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const statusQuery = trpc.integrations.mcpStatus.useQuery(undefined, {
    enabled: false,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const mappingsQuery = trpc.integrations.projectMappings.useQuery(
    { projectId },
    { staleTime: 60_000 }
  );
  const coordinatorQuery = trpc.agent.snapshot.useQuery(
    { projectId },
    { staleTime: 10_000, refetchOnWindowFocus: true }
  );
  const mcpProjectIds: Partial<Record<"eap" | "cronograma" | "ganttLob", string>> = {};
  for (const mapping of mappingsQuery.data ?? []) {
    const value = mapping.externalProjectId?.trim();
    if (value && value.toLowerCase() !== "default") {
      mcpProjectIds[mapping.provider] = value;
    }
  }
  const agentMutation = trpc.agent.orchestrate.useMutation({
    onSuccess: response => {
      setMessages(previous => [
        ...previous,
        {
          role: "assistant",
          content: response.content,
        },
      ]);
    },
    onError: error => {
      setMessages(previous => [
        ...previous,
        {
          role: "assistant",
          content: `Não foi possível concluir a análise: ${error.message}`,
        },
      ]);
    },
  });

  const handleSend = (content: string) => {
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    agentMutation.mutate({
      projectId,
      mcpProjectIds,
      messages: nextMessages
        .filter(
          (message): message is Message & { role: "user" | "assistant" } =>
            message.role !== "system"
        )
        .map(message => ({
          role: message.role,
          content: message.content,
        })),
      context: {
        activeSection,
        activeSubtab,
        contextMode: "focused",
      },
    });
  };

  const mcpOnline = statusQuery.data?.status === "online";
  const mcpDomains = ["eap", "cronograma", "ganttLob"] as const;
  const coordinator = coordinatorQuery.data;

  return (
    <>
      <button
        className="agent-sidebar-backdrop"
        aria-label="Fechar agente"
        onClick={onClose}
      />
      <aside className="agent-sidebar" aria-label="Agente da obra">
        <header className="agent-sidebar-header">
          <div className="agent-sidebar-title">
            <div className="agent-sidebar-icon">
              <Bot size={17} />
            </div>
            <div>
              <span className="eyebrow accent">AGENTE DA OBRA</span>
              <strong>Planejamento e produção</strong>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            title="Fechar agente"
          >
            <X size={16} />
          </button>
        </header>

        <div className="agent-sidebar-context">
          <div className="agent-context-row">
            <Database size={14} />
            <div>
              <span>Obra em análise</span>
              <strong>{projectName || `Obra ${projectId}`}</strong>
            </div>
          </div>
          <div className="agent-context-row">
            <Bot size={14} />
            <div>
              <span>Contexto prioritário</span>
              <strong>
                {sectionLabels[activeSection]}
                {activeSubtab ? ` · ${activeSubtab}` : ""}
              </strong>
            </div>
          </div>
          <div className="agent-context-row">
            <ShieldCheck size={14} />
            <div>
              <span>Marco do coordenador</span>
              <strong>
                {coordinator
                  ? stageLabels[coordinator.stage] ?? coordinator.stage
                  : "Carregando estado..."}
                {coordinator && coordinator.blockerCount > 0
                  ? ` · ${coordinator.blockerCount} bloqueador(es)`
                  : ""}
              </strong>
            </div>
          </div>
          <div
            className={`agent-source-status ${mcpOnline ? "online" : "degraded"}`}
          >
            <span className="agent-status-dot" />
            {statusQuery.isFetching
              ? "Verificando fontes..."
              : mcpOnline
                ? "MCPs disponíveis para consulta"
                : statusQuery.data?.status === "degraded"
                  ? "MCPs parcialmente disponíveis"
                  : "MCPs ainda não testados"}
            <button
              className="icon-button"
              title="Testar conexões MCP"
              aria-label="Testar conexões MCP"
              disabled={statusQuery.isFetching}
              onClick={() => void statusQuery.refetch()}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="agent-mcp-grid" aria-label="Status dos MCPs">
            {mcpDomains.map(domain => {
              const server = statusQuery.data?.servers?.[domain];
              const online = server?.status === "online";
              return (
                <div
                  className={`agent-mcp-row ${online ? "online" : "offline"}`}
                  key={domain}
                  title={server?.lastError ?? undefined}
                >
                  <span className="agent-mcp-name">
                    {online ? <CircleCheck size={11} /> : <CircleAlert size={11} />}
                    {mcpLabels[domain]}
                  </span>
                  <span className="agent-mcp-meta">
                    {server
                      ? `${server.latencyMs} ms · ${server.attempts} tentativa${server.attempts === 1 ? "" : "s"}`
                      : "aguardando"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="agent-sidebar-safety">
          <ShieldCheck size={14} />
          <span>
            Coordenador único por obra. Leitura e auditoria ativas; alterações
            só após aprovação.
          </span>
        </div>
        {statusQuery.error && (
          <div className="agent-sidebar-warning">
            <CircleAlert size={14} />
            <span>
              O agente usará os dados locais e informará as fontes
              indisponíveis.
            </span>
          </div>
        )}

        <AIChatBox
          className="agent-sidebar-chat"
          messages={messages}
          onSendMessage={handleSend}
          isLoading={agentMutation.isPending}
          height="100%"
          placeholder="Pergunte sobre produção, medição ou prazo..."
          emptyStateMessage="Pergunte sobre a obra. O agente priorizará a área que está aberta."
          suggestedPrompts={[
            "O que precisa de atenção hoje?",
            "Quais atividades estão atrasadas?",
            "Compare o planejado com o realizado.",
          ]}
        />
      </aside>
    </>
  );
}
