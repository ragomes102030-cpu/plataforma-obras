import { trpc } from "@/lib/trpc";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Bot, CircleAlert, Database, ShieldCheck, X } from "lucide-react";
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
    staleTime: 60_000,
  });
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
          <div
            className={`agent-source-status ${mcpOnline ? "online" : "degraded"}`}
          >
            <span className="agent-status-dot" />
            {statusQuery.isPending
              ? "Verificando fontes..."
              : mcpOnline
                ? "MCPs disponíveis para consulta"
                : "Modo local: MCPs indisponíveis"}
          </div>
        </div>

        <div className="agent-sidebar-safety">
          <ShieldCheck size={14} />
          <span>Somente leitura neste marco. O agente não altera a obra.</span>
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
