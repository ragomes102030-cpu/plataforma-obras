import { useEffect, useRef, useState } from "react";
import { Sparkles, X, ChevronDown, ChevronUp, Settings, MessageSquarePlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { deveRevalidarDadosDaObraAposExecucao } from "@/lib/agent-run-cache";

/**
 * O agente, como janela flutuante sobre as abas.
 *
 * POR QUE FLUTUANTE E NÃO ABA
 *
 * O agente é um assistente SOBRE a aba que está aberta, não uma aba. Como aba,
 * seria uma sétima entrada na lista que a pessoa navega, e a resposta à pergunta
 * "como está a minha obra?" passaria a ser mais um lugar para ir. Flutuante, ele
 * fica disponível de qualquer aba e sabe qual é a atual, porque o pai passa
 * junto.
 *
 * POR QUE ELE NÃO CALCULA NADA
 *
 * A resposta vem de `agent.chat`, que monta a evidência pelo `EvidenceSourceRouter`
 * — banco local primeiro, MCP só como resgate — e a entrega ao orquestrador como
 * contexto. O agente pode propor e registrar dados sustentados pelas fontes da
 * obra, sempre com releitura da gravação. O prazo e o CPM são responsabilidade
 * do motor (`shared/cronograma-colunas.ts` e `calculateDeterministicCpm`), não
 * do modelo.
 *
 * O QUE ESTA JANELA AINDA NÃO MOSTRA
 *
 * A ficha da evidência — de qual fonte a resposta veio, quantos nós e atividades
 * entraram, quais avisos e erros a coleta gerou. Ela está descrita, e não
 * desenhada, em `GAP-EVIDENCIA-VISIVEL` mais abaixo, com o motivo.
 */

type Props = {
  projetoId: number;
  obra: string;
  /** A aba aberta. O agente sabe, e usa para dar contexto. */
  abaAtual: string;
};

type Mensagem = { role: "user" | "assistant"; content: string };
type Conversa = { id: string; nome: string };
const CONVERSA_LEGADA = "legacy";
const LIMITE_MENSAGENS_VISIVEIS = 6;

function chaveConversa(projetoId: number, sufixo: string) {
  return `arquimedes-chat:v1:${projetoId}:${sufixo}`;
}

function carregarConversaAtual(projetoId: number) {
  if (typeof window === "undefined") return CONVERSA_LEGADA;
  try {
    return window.localStorage.getItem(chaveConversa(projetoId, "current")) ?? CONVERSA_LEGADA;
  } catch {
    return CONVERSA_LEGADA;
  }
}

function carregarConversas(projetoId: number): Conversa[] {
  const legado = { id: CONVERSA_LEGADA, nome: "Histórico anterior" };
  if (typeof window === "undefined") return [legado];
  let conversas: Conversa[] = [legado];
  try {
    const raw = window.localStorage.getItem(chaveConversa(projetoId, "sessions"));
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (Array.isArray(parsed)) {
      const salvas = parsed.filter((item): item is Conversa =>
        Boolean(item) && typeof item === "object" &&
        typeof (item as Conversa).id === "string" && typeof (item as Conversa).nome === "string"
      );
      conversas = salvas.some(item => item.id === CONVERSA_LEGADA) ? salvas : [legado, ...salvas];
    }
  } catch {
    // A conversa legada continua acessível se os metadados locais estiverem inválidos.
  }
  const atual = carregarConversaAtual(projetoId);
  return atual === CONVERSA_LEGADA || conversas.some(item => item.id === atual)
    ? conversas
    : [...conversas, { id: atual, nome: "Conversa atual" }];
}

function salvarConversaAtual(projetoId: number, conversationId: string) {
  try {
    window.localStorage.setItem(chaveConversa(projetoId, "current"), conversationId);
  } catch {
    // A conversa continua funcionando na sessão atual mesmo sem armazenamento local.
  }
}

/**
 * O único estado que ainda está em execução é `executando`. Os outros cinco de
 * `AGENT_RUN_STATUSES` são terminais: se o laço não os tratar como fim, ele
 * martela `agent.status` de 1,5 em 1,5 segundo até o relógio de 2 minutos estourar,
 * numa resposta que já chegou.
 */
const ESTADO_TERMINAL = new Set([
  "respondido",
  "falhou",
  "timeout",
  "aguardando_confirmacao",
  "dados_incompletos",
]);

const PERGUNTAS_SUGERIDAS = [
  "O que está faltando para eu fechar o cronograma?",
  "Qual atividade está atrasada e por quê?",
  "A minha EAP cobre tudo que está no orçamento?",
];

export function JanelaAgente({ projetoId, obra, abaAtual }: Props) {
  const [aberta, setAberta] = useState(false);
  const [expandida, setExpandida] = useState(true);
  const [texto, setTexto] = useState("");
  const [historico, setHistorico] = useState<Mensagem[]>([]);
  const [conversaId, setConversaId] = useState(() => carregarConversaAtual(projetoId));
  const [conversas, setConversas] = useState(() => carregarConversas(projetoId));
  const [mostrarHistoricoCompleto, setMostrarHistoricoCompleto] = useState(false);
  const historicoPersistido = trpc.agent.history.useQuery(
    { projectId: projetoId, conversationId: conversaId },
    { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: false },
  );
  const [aguardando, setAguardando] = useState(false);
  const fim = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setConversaId(carregarConversaAtual(projetoId));
    setConversas(carregarConversas(projetoId));
    setHistorico([]);
  }, [projetoId]);

  useEffect(() => {
    if (!historicoPersistido.data || historicoPersistido.data.conversationId !== conversaId) return;
    setHistorico(historicoPersistido.data.messages);
  }, [historicoPersistido.data, conversaId]);

  useEffect(() => {
    const abrir = () => {
      setAberta(true);
      void historicoPersistido.refetch();
    };
    window.addEventListener("abrir-agente-eap", abrir);
    window.addEventListener("abrir-arquimedes", abrir);
    return () => {
      window.removeEventListener("abrir-agente-eap", abrir);
      window.removeEventListener("abrir-arquimedes", abrir);
    };
  }, [historicoPersistido]);

  const utils = trpc.useUtils();
  const chat = trpc.agent.chat.useMutation({
    onSuccess: async r => {
      // `agent.chat` só INICIA a execução. `startAgentExecution` dispara
      // `void executeAgentRun(...)` e devolve a view do instante zero — status
      // `executando` e `result: null`. Ler `result` aqui devolveria sempre
      // vazio; o texto vem depois, por `agent.status`.
      if (r.errorCode === "falhou" || !r.requestId) {
        setAguardando(false);
        setHistorico(antigo => [
          ...antigo,
          {
            role: "assistant",
            content: r.errorMessage ?? "O agente não conseguiu começar.",
          },
        ]);
        return;
      }
      await aguardarExecucao(r.requestId);
    },
    onError: () => setAguardando(false),
  });

  /**
   * Acompanha o run até um estado terminal. O intervalo é de 1,5s: mais que isso
   * faz a janela parecer quebrada, e menos que isso martela a API sem ganho.
   */
  async function aguardarExecucao(requestId: string) {
    const inicio = Date.now();
    const LIMITE_MS = 120_000;

    for (;;) {
      const s = await utils.agent.status.fetch({ requestId: requestId });

      if (s && ESTADO_TERMINAL.has(s.status)) {
        if (deveRevalidarDadosDaObraAposExecucao(s)) {
          // O agente grava no servidor sem passar pelas mutations do cliente.
          // Revalidar as queries observadas atualiza a aba e os painéis da obra
          // sem exigir que o engenheiro recarregue a página.
          void utils.invalidate();
        }
        setHistorico(antigo => [...antigo, { role: "assistant", content: textoDoRun(s) }]);
        await historicoPersistido.refetch();
        setAguardando(false);
        return;
      }

      if (Date.now() - inicio > LIMITE_MS) {
        setHistorico(antigo => [
          ...antigo,
          {
            role: "assistant",
            content:
              "A execução passou de 2 minutos e a janela parou de acompanhar. O run continua registrado por este requestId, no log do agente.",
          },
        ]);
        setAguardando(false);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  function perguntar(pergunta: string) {
    const limpa = pergunta.trim();
    // `chat.isPending` só cobre a chamada da mutation. A execução continua
    // depois dela, no laço de polling — por isso o `aguardando`, senão uma
    // segunda pergunta sairia enquanto a primeira ainda não respondeu.
    if (!limpa || aguardando) return;
    setMostrarHistoricoCompleto(false);
    setHistorico(antigo => [...antigo, { role: "user", content: limpa }]);
    setTexto("");
    setAguardando(true);
    chat.mutate({
      projectId: projetoId,
      conversationId: conversaId,
      // A aba entra na PRIMEIRA mensagem de cada chamada, e não num campo do
      // input: o histórico que fica no log continua legível sem precisar saber
      // que existe contexto. O zod limita a 20 mensagens, então o histórico
      // antigo é cortado e a pergunta nova entra no fim.
      messages: [
        ...historico.slice(-18).map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: `[aba: ${abaAtual}] ${limpa}` },
      ],
    });
  }

  function iniciarNovaConversa() {
    if (ocupado) return;
    const id = window.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const proxima = [...conversas.filter(item => item.id !== id), { id, nome: `Conversa ${conversas.length}` }];
    try {
      window.localStorage.setItem(chaveConversa(projetoId, "sessions"), JSON.stringify(proxima));
    } catch {
      // A sessão atual permanece disponível mesmo se o navegador bloquear armazenamento local.
    }
    salvarConversaAtual(projetoId, id);
    setConversas(proxima);
    setHistorico([]);
    setTexto("");
    setConversaId(id);
  }

  // Rola para o fim a cada mensagem nova, senão a janela cresce para cima e a
  // última fica fora da vista.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [historico, aguardando]);

  const ocupado = aguardando || chat.isPending;

  return (
    <>
      {aberta && (
        <section className="janela-agente" aria-label="Agente">
          <header className="janela-agente-topo">
            <button
              type="button"
              className="janela-agente-toggle"
              onClick={() => setExpandida(e => !e)}
              title={expandida ? "Recolher" : "Expandir"}
            >
              {expandida ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
            <Sparkles size={14} />
            <strong>Arquimedes</strong>
            <button
              type="button"
              className="janela-agente-config"
              onClick={() => window.dispatchEvent(new CustomEvent("abrir-configuracao-llm"))}
              title="Configurar LLM do Arquimedes"
              aria-label="Configurar LLM do Arquimedes"
            >
              <Settings size={14} />
            </button>
            <span className="janela-agente-obra">
              {obra} · {abaAtual}
            </span>
            <button
              type="button"
              className="janela-agente-fechar"
              onClick={() => setAberta(false)}
              title="Fechar o agente"
            >
              <X size={15} />
            </button>
          </header>

          {expandida && (
            <>
              {/*
                GAP-EVIDENCIA-VISIVEL

                Aqui entraria a ficha da evidência: de qual fonte a resposta veio
                (banco local ou o MCP de resgate), quantos nós e atividades
                entraram na coleta, e quais avisos e erros ela gerou — para a
                resposta chegar com o de onde.

                Não está desenhada porque `agent.chat` e `agent.status` devolvem
                um `AgentRunView`, e ele não carrega a evidência: a mutation
                monta a evidência, entrega ao orquestrador como contexto e
                devolve só `requestId` e status. Escrevi esta tela com a ficha
                pronta, achando que o campo existia; o compilador disse que não,
                e estava certo.

                Desenhar um "—" no lugar seria a estrutura que parece pronta e
                não informa nada, que é o que esta obra veio para evitar. A
                ficha entra quando `agent.chat` devolver `evidence` no retorno.
              */}

              {/* GAP-CONFIRMACAO: `aguardando_confirmacao` é terminal e sai
                  abaixo, mas o backend não expõe nenhuma procedure para
                  confirmar. A janela não pode destravar esse run — ela diz que
                  parou e por quê. Ver `textoDoRun`. */}

              <div className="janela-agente-conversa-controles">
                <select
                  aria-label="Conversas do Arquimedes"
                  value={conversaId}
                  disabled={ocupado}
                  onChange={e => {
                    const id = e.target.value;
                    salvarConversaAtual(projetoId, id);
                    setHistorico([]);
                    setTexto("");
                    setConversaId(id);
                    setMostrarHistoricoCompleto(false);
                  }}
                >
                  {conversas.map(conversa => (
                    <option key={conversa.id} value={conversa.id}>{conversa.nome}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="janela-agente-nova-conversa"
                  onClick={iniciarNovaConversa}
                  disabled={ocupado}
                  title="Começar uma conversa sem misturar o contexto anterior"
                >
                  <MessageSquarePlus size={13} />
                  Nova conversa
                </button>
              </div>

              <div className="janela-agente-fala">
                {historico.length === 0 && (
                  <p className="janela-agente-vazio">
                    Pergunte sobre a obra. Ele lê a evidência do banco — e, se a
                    obra estiver mapeada nos MCPs, completa de lá — e responde com
                    o que encontrou. O prazo e o CPM não saem dele: quem calcula é
                    o motor.
                  </p>
                )}
                {historico.length > LIMITE_MENSAGENS_VISIVEIS && (
                  <button
                    type="button"
                    className="janela-agente-historico-toggle"
                    aria-expanded={mostrarHistoricoCompleto}
                    onClick={() => setMostrarHistoricoCompleto(value => !value)}
                  >
                    {mostrarHistoricoCompleto
                      ? "Ocultar mensagens anteriores"
                      : `Ver ${historico.length - LIMITE_MENSAGENS_VISIVEIS} mensagens anteriores`}
                  </button>
                )}
                {(mostrarHistoricoCompleto
                  ? historico
                  : historico.slice(-LIMITE_MENSAGENS_VISIVEIS)
                ).map((m, i) => (
                  <div key={i} className={`janela-msg janela-msg-${m.role}`}>
                    {m.content}
                  </div>
                ))}
                {ocupado && <div className="janela-msg janela-msg-pendente">lendo a obra…</div>}
                {chat.isError && <div className="janela-msg janela-msg-erro">{chat.error.message}</div>}
                <div ref={fim} />
              </div>

              {historico.length === 0 && !ocupado && (
                <div className="janela-agente-sugestoes">
                  {PERGUNTAS_SUGERIDAS.map(p => (
                    <button key={p} type="button" onClick={() => perguntar(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              )}

              <form
                className="janela-agente-form"
                onSubmit={e => {
                  e.preventDefault();
                  perguntar(texto);
                }}
              >
                <textarea
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      perguntar(texto);
                    }
                  }}
                  placeholder="Pergunte sobre a obra…"
                  disabled={ocupado}
                  rows={3}
                />
                <button type="submit" disabled={ocupado || !texto.trim()}>
                  {ocupado ? "…" : "Enviar"}
                </button>
              </form>
            </>
          )}
        </section>
      )}

      {!aberta && (
        <button
          type="button"
          className="janela-agente-abrir"
          onClick={() => setAberta(true)}
          title="Abrir o agente"
        >
          <Sparkles size={14} />
          Arquimedes
        </button>
      )}
    </>
  );
}

/**
 * Transforma um estado terminal em texto. Cada um dos cinco estados recebe
 * tratamento próprio: "parou sem resposta" para todos seria esconder a
 * diferença entre uma falha e um run que terminou em timeout.
 */
function textoDoRun(run: {
  status: string;
  result?: { content?: string | null } | null;
  errorMessage?: string | null;
}): string {
  switch (run.status) {
    case "respondido": {
      const texto = run.result?.content?.trim();
      return texto || "O agente terminou sem texto.";
    }
    case "aguardando_confirmacao":
      return (
        "O agente parou esperando uma confirmação que esta janela não pode " +
        "enviar — o backend não expõe nenhuma procedure para confirmar. " +
        "O run ficou registrado por este requestId, no log do agente."
      );
    case "dados_incompletos":
      return (
        run.errorMessage ||
        "O agente parou por falta de dado suficiente. Traga as folhas da EAP " +
          "para o cronograma e pergunte de novo."
      );
    case "timeout":
      return run.errorMessage || "O agente excedeu o tempo de resposta.";
    default:
      return run.errorMessage || "A execução parou sem resposta.";
  }
}
