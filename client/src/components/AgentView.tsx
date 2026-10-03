import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ShieldCheck } from "lucide-react";

const terminalStatuses = new Set([
  "respondido",
  "falhou",
  "timeout",
  "aguardando_confirmacao",
  "dados_incompletos",
]);

function terminalMessage(run: {
  requestId: string;
  status: string;
  errorMessage?: string | null;
  result?: { content?: string } | null;
}) {
  if (run.status === "respondido" && run.result?.content)
    return run.result.content;
  const labels: Record<string, string> = {
    falhou: "falhou",
    timeout: "atingiu o tempo limite",
    aguardando_confirmacao: "aguarda confirmação",
    dados_incompletos: "terminou com dados incompletos",
  };
  return `A execução ${labels[run.status] ?? "terminou"}. ${run.errorMessage ?? "Revise o request_id e tente novamente."}\n\nRequest ID: ${run.requestId}`;
}

export function AgentView() {
  const projectsQuery = trpc.projects.list.useQuery();
  const projects = projectsQuery.data ?? [];
  const [projectId, setProjectId] = useState<number>(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const historyQuery = trpc.agent.history.useQuery(
    { projectId },
    { staleTime: 0, refetchOnWindowFocus: false, refetchOnMount: true },
  );
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const handledRequestRef = useRef<string | null>(null);
  const agentMutation = trpc.agent.chat.useMutation({
    onSuccess: response => {
      handledRequestRef.current = null;
      setActiveRequestId(response.requestId);
    },
    onError: error => {
      setActiveRequestId(null);
      setMessages(previous => [
        ...previous,
        {
          role: "assistant",
          content: `Não foi possível iniciar a execução do agente: ${error.message}`,
        },
      ]);
    },
  });
  const executionQuery = trpc.agent.status.useQuery(
    { requestId: activeRequestId ?? "aguardando" },
    {
      enabled: Boolean(activeRequestId),
      refetchInterval: activeRequestId ? 1000 : false,
      retry: 1,
      refetchOnWindowFocus: true,
    }
  );

  useEffect(() => {
    if (!historyQuery.data) return;
    setMessages(historyQuery.data.messages);
  }, [historyQuery.data]);

  useEffect(() => {
    if (
      projects.length &&
      !projects.some(project => project.id === projectId)
    ) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  useEffect(() => {
    const run = executionQuery.data;
    if (!activeRequestId || !run || run.requestId !== activeRequestId) return;
    if (!terminalStatuses.has(run.status)) return;
    if (handledRequestRef.current === run.requestId) return;
    handledRequestRef.current = run.requestId;
    setActiveRequestId(null);
    setMessages(previous => [
      ...previous,
      { role: "assistant", content: terminalMessage(run) },
    ]);
  }, [activeRequestId, executionQuery.data]);

  useEffect(() => {
    if (!activeRequestId) return;
    const timeout = window.setTimeout(() => {
      setActiveRequestId(current => {
        if (current !== activeRequestId) return current;
        setMessages(previous => [
          ...previous,
          {
            role: "assistant",
            content: `Não foi possível obter o estado final do agente no navegador. A execução pode continuar no servidor; consulte o request_id ${activeRequestId}.`,
          },
        ]);
        return null;
      });
    }, 130_000);
    return () => window.clearTimeout(timeout);
  }, [activeRequestId]);

  const selectedProject = useMemo(
    () => projects.find(project => project.id === projectId),
    [projects, projectId]
  );
  const handleSend = (content: string) => {
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    const agentMessages = nextMessages.map(message => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
    agentMutation.mutate({ projectId, messages: agentMessages });
  };
  const isLoading = agentMutation.isPending || Boolean(activeRequestId);

  return (
    <div className="module-page">
      <div className="module-hero">
        <div className="module-icon">
          <Bot size={22} />
        </div>
        <div>
          <p className="eyebrow accent">AGENTE DE PLANEJAMENTO</p>
          <h2>Agente IA</h2>
          <p>
            Analise uma obra com contexto de EAP, avanço, criticidade e linha de
            base.
          </p>
        </div>
        <div className="module-card agent-safety-note">
          <ShieldCheck size={16} /> A chave da IA permanece no servidor.
        </div>
      </div>
      <div className="module-card agent-project-picker">
        <label htmlFor="agent-project">Obra em análise</label>
        <select
          id="agent-project"
          value={projectId}
          onChange={event => {
            setProjectId(Number(event.target.value));
            setMessages([]);
            setActiveRequestId(null);
          }}
        >
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.code} — {project.name}
            </option>
          ))}
        </select>
        <span>
          {selectedProject
            ? `${selectedProject.location} · ${selectedProject.progress}% informado`
            : "Selecione uma obra"}
        </span>
      </div>
      <AIChatBox
        messages={messages}
        onSendMessage={handleSend}
        isLoading={isLoading}
        loadingMessage={
          executionQuery.data?.currentStep ?? "Iniciando execução rastreável..."
        }
        height="560px"
        placeholder="Pergunte sobre prazo, caminho crítico, restrições ou próxima ação..."
        emptyStateMessage="O agente está pronto para analisar a obra selecionada."
        suggestedPrompts={[
          "Quais atividades merecem atenção primeiro?",
          "Quais dados preciso lançar para controlar a produção?",
          "Como posso reduzir o risco de atraso desta obra?",
        ]}
      />
    </div>
  );
}
