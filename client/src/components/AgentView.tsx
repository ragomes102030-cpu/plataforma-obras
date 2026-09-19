import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { Bot, ShieldCheck } from "lucide-react";

export function AgentView() {
  const projectsQuery = trpc.projects.list.useQuery();
  const projects = projectsQuery.data ?? [];
  const [projectId, setProjectId] = useState<number>(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const agentMutation = trpc.agent.chat.useMutation({
    onSuccess: response => {
      setMessages(previous => [
        ...previous,
        { role: "assistant", content: response.content },
      ]);
    },
    onError: error => {
      setMessages(previous => [
        ...previous,
        {
          role: "assistant",
          content: `Não foi possível consultar o agente: ${error.message}`,
        },
      ]);
    },
  });

  useEffect(() => {
    if (
      projects.length &&
      !projects.some(project => project.id === projectId)
    ) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

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
        isLoading={agentMutation.isPending}
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
