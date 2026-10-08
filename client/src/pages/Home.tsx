import { Layers3, Plus, Sparkles, X, ChevronDown, ChevronUp, Trash2, Menu, Home as HomeIcon, ClipboardList, TreePine, ListTodo, CalendarDays, BarChart3, Activity, Package, WalletCards, ShieldAlert, Bot, GitBranch, Network, LockKeyhole, Search, Bell, Settings2 } from "lucide-react";
import { FormEvent, Fragment, ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { localIsoDe } from "@/lib/datas";
import { CentralComandoArquimedes } from "@/components/CentralComandoArquimedes";
import { JanelaAgente } from "@/components/JanelaAgente";
import { startLogin } from "@/const";
import { AbaCatalogo } from "@/components/AbaCatalogo";
import { AbaEap } from "@/components/AbaEap";
import { AbaDependencias } from "@/components/AbaDependencias";
import { AbaCpm } from "@/components/AbaCpm";
import { AbaBaseline } from "@/components/AbaBaseline";
import { AbaProducao } from "@/components/AbaProducao";
import { PainelPlanejamento } from "@/components/PainelPlanejamento";
import { PainelDoCronograma } from "@/components/PainelDoCronograma";
import { VisualizacaoPlanejamento } from "@/components/VisualizacaoPlanejamento";
import { ABAS, type IdDaAba } from "@/modules/abas";
import type { AgregadoDoCronograma, EntradaDaLinha } from "@shared/cronograma-colunas";
import { CALENDARIO_CORRIDO } from "@shared/cronograma-colunas";
import type { IsoDate, WorkCalendar } from "@shared/work-calendar";
import "@/planilha.css";
import "@/eap.css";

/**
 * A obra como planilha.
 *
 * POR QUE ESTE ARQUIVO É PEQUENO
 *
 * A versão anterior desta tela tinha 1.743 linhas e carregava o portfólio, o
 * painel do agente, o checklist de planejamento, o despacho de módulos, o modal
 * de nova obra e a planilha — cinco produtos num arquivo só. Qualquer coisa que
 * se mexesse numa mexia nas outras quatro, e era isso que produzia a sequência
 * de telas quebradas.
 *
 * Aqui não há menu lateral e não há despacho de módulo. A navegação da obra são
 * as abas, embaixo, e o que não é aba fica na barra de título. O registro das
 * abas é `modules/abas.ts`, que é dado, não código: acrescentar aba é
 * acrescentar uma entrada na lista, sem tocar em componente.
 *
 * POR QUE NADA CALCULA AQUI
 *
 * A grade e o painel recebem do motor (`shared/cronograma-colunas.ts` via
 * `planning.grade`) as colunas já derivadas, e a data de hoje vem no payload.
 * Se este arquivo fizesse aritmética de data, duração ou progresso, existiriam
 * duas verdades sobre a mesma célula.
 */

type Destino = "obra" | "catalogo" | "config";

export default function Home() {
  const { user } = useAuth();
  const [destino, setDestino] = useState<Destino>("obra");
  const [aba, setAba] = useState<IdDaAba>("dashboard");
  const [obraId, setObraId] = useState<number | null>(null);
  const [novaObraAberta, setNovaObraAberta] = useState(false);
  const [obrasOcultas, setObrasOcultas] = useState<number[]>([]);
  const [faixaObrasRecolhida, setFaixaObrasRecolhida] = useState(false);
  const [faixaObrasFechada, setFaixaObrasFechada] = useState(false);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [obraParaExcluir, setObraParaExcluir] = useState<{ id: number; name: string } | null>(null);
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState("");

  // `projects.list` devolve o array direto. O tipo é uma união porque o
  // procedure tem um caminho sem banco, e o cliente não deve casar com nenhum
  // dos dois formatos: só precisa do id, do nome e do código para a barra de
  // título.
  // A consulta so parte com sessao CONFIRMADA. `user === null` e ausencia, e
  // pedir a lista nesse estado só produziria um 401 que o painel leria como obra
  // vazia.
  const obras = trpc.projects.list.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
  });
  const lista: Array<{ id: number; name: string; code: string; location?: string; descricao?: string | null; tipoDeObra?: string | null }> =
    (obras.data as Array<{ id: number; name: string; code: string; location?: string; descricao?: string | null; tipoDeObra?: string | null }> | undefined) ?? [];
  const obrasVisiveis = lista.filter(o => !obrasOcultas.includes(o.id));
  const obra = obraId == null ? lista[0] : lista.find(o => o.id === obraId);
  const projetoId = obra?.id ?? null;
  const lixeira = trpc.projects.trash.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const moverParaLixeira = trpc.projects.moveToTrash.useMutation({ onSuccess: async () => { await Promise.all([obras.refetch(), lixeira.refetch()]); setObraParaExcluir(null); setConfirmacaoExclusao(""); setObraId(null); setDestino("obra"); } });
  const restaurarObra = trpc.projects.restoreFromTrash.useMutation({ onSuccess: () => Promise.all([obras.refetch(), lixeira.refetch()]) });

  const criarDemo = trpc.projects.createDemoGantt.useMutation({
    onSuccess: async created => {
      await obras.refetch();
      setObraId(created.id);
      setDestino("obra");
      setAba("gantt");
    },
  });

  const criarObra = trpc.projects.create.useMutation({
    onSuccess: async created => {
      await obras.refetch();
      setObraId(created.id);
      setDestino("obra");
      setAba("eap");
      setNovaObraAberta(false);
    },
  });

  useEffect(() => {
    const open = () => setNovaObraAberta(true);
    window.addEventListener("abrir-nova-obra", open);
    return () => window.removeEventListener("abrir-nova-obra", open);
  }, []);

  useEffect(() => {
    const openConfig = () => setDestino("config");
    const openEap = () => { setDestino("obra"); setAba("eap"); };
    const openAtividades = () => { setDestino("obra"); setAba("atividades"); };
    window.addEventListener("abrir-configuracao-llm", openConfig);
    window.addEventListener("abrir-aba-eap", openEap);
    window.addEventListener("abrir-aba-atividades", openAtividades);
    return () => {
      window.removeEventListener("abrir-configuracao-llm", openConfig);
      window.removeEventListener("abrir-aba-eap", openEap);
      window.removeEventListener("abrir-aba-atividades", openAtividades);
    };
  }, []);

  return (
    <div className="xl-app">
      <header className="xl-titlebar">
        <div className="xl-titlebar-marca">
          <Layers3 size={15} />
          <strong>{obra?.name ?? "plataformaobras"}</strong>
          {obra && <span className="xl-titlebar-sub">{obra.code}</span>}
        </div>

        {!faixaObrasFechada && (
          <button
            type="button"
            className="xl-titlebar-collapse"
            onClick={() => setFaixaObrasRecolhida(v => !v)}
            title={faixaObrasRecolhida ? "Expandir obras abertas" : "Recolher obras abertas"}
            aria-label={faixaObrasRecolhida ? "Expandir obras abertas" : "Recolher obras abertas"}
          >
            {faixaObrasRecolhida ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}
        {faixaObrasFechada ? (
          <button
            type="button"
            className="xl-titlebar-reabrir"
            onClick={() => {
              setFaixaObrasFechada(false);
              setFaixaObrasRecolhida(false);
            }}
            title="Abrir novamente a janela de obras"
            aria-label="Abrir novamente a janela de obras"
          >
            <ChevronDown size={14} /> Obras
          </button>
        ) : !faixaObrasRecolhida && <div className="xl-titlebar-obras">
          {obrasVisiveis.map(o => (
            <div
              key={o.id}
              className={`xl-obra-chip-wrap${o.id === obra?.id && destino === "obra" ? " ativa" : ""}`}
            >
              <button
                type="button"
                className="xl-obra-chip"
                onClick={() => {
                  setObraId(o.id);
                  setDestino("obra");
                }}
                title={o.name}
              >
                {o.name}
              </button>
              <button
                type="button"
                className="xl-obra-chip-lixeira"
                onClick={() => {
                  setObraParaExcluir({ id: o.id, name: o.name });
                  setConfirmacaoExclusao("");
                }}
                title="Enviar obra para a lixeira"
                aria-label={`Enviar ${o.name} para a lixeira`}
              >
                <Trash2 size={11} />
              </button>
              <button
                type="button"
                className="xl-obra-chip-fechar"
                onClick={() => {
                  setObrasOcultas(ocultas => [...ocultas, o.id]);
                  if (obraId === o.id) {
                    const proxima = obrasVisiveis.find(v => v.id !== o.id);
                    if (proxima) setObraId(proxima.id);
                  }
                }}
                title="Fechar esta aba (não exclui a obra)"
                aria-label={`Fechar ${o.name}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {obrasOcultas.length > 0 && (
            <button
              type="button"
              className="xl-obra-reabrir"
              onClick={() => setObrasOcultas([])}
              title="Reabrir todas as obras ocultas"
            >
              + {obrasOcultas.length} fechada{obrasOcultas.length > 1 ? "s" : ""}
            </button>
          )}
          <button
            type="button"
            className="xl-obra-chip xl-obra-nova"
            title="Nova obra"
            aria-label="Criar nova obra"
            onClick={() => setNovaObraAberta(true)}
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            className="xl-obra-chip xl-demo-obra"
            disabled={criarDemo.isPending}
            title="Criar uma obra ilustrativa com Gantt e Linha de Balanço"
            onClick={() => criarDemo.mutate()}
          >
            {criarDemo.isPending ? "Montando…" : "Gantt demo"}
          </button>
        </div>}
        {!faixaObrasFechada && (
          <button
            type="button"
            className="xl-titlebar-fechar"
            onClick={() => {
              setFaixaObrasFechada(true);
              setFaixaObrasRecolhida(false);
            }}
            title="Fechar a janela de obras"
            aria-label="Fechar a janela de obras"
          >
            <X size={13} />
          </button>
        )}

        <div className="xl-titlebar-fim">
          <button
            type="button"
            className={`xl-tb-btn${destino === "obra" ? " ativo" : ""}`}
            onClick={() => setDestino("obra")}
          >
            Obra
          </button>
          <button
            type="button"
            className={`xl-tb-btn${destino === "catalogo" ? " ativo" : ""}`}
            onClick={() => setDestino("catalogo")}
          >
            Catálogo
          </button>
          <button
            type="button"
            className="xl-tb-btn xl-tb-arquimedes"
            onClick={() => window.dispatchEvent(new CustomEvent("abrir-arquimedes"))}
            title="Abrir o Arquimedes"
          >
            <Bot size={13} /> Arquimedes
          </button>
          {user?.role === "admin" && (
            <button
              type="button"
              className={`xl-tb-btn${destino === "config" ? " ativo" : ""}`}
              onClick={() => setDestino("config")}
            >
              <Sparkles size={13} /> Central de Comando
            </button>
          )}
          {user ? (
            <>
              <span className="xl-tb-user" title={user.name || "Conta"}>
                {(user.name || "R").charAt(0).toUpperCase()}
              </span>
              <button
                type="button"
                className="xl-tb-btn xl-tb-auth"
                onClick={() => { window.location.href = "/api/auth/logout"; }}
                title="Sair da conta e permitir novo login"
              >
                Sair
              </button>
            </>
          ) : user === null ? (
            <button
              type="button"
              className="xl-tb-btn xl-tb-auth"
              onClick={startLogin}
              title="Entrar com GitHub"
            >
              Entrar
            </button>
          ) : null}
        </div>
      </header>

      <button type="button" className="xl-lixeira-btn" onClick={() => setLixeiraAberta(true)} title="Abrir lixeira de obras"><Trash2 size={13} /> Lixeira{lixeira.data?.length ? ` (${lixeira.data.length})` : ""}</button>

      {novaObraAberta && (
        <NovaObraDialog
          busy={criarObra.isPending}
          error={criarObra.error?.message ?? null}
          onClose={() => {
            if (!criarObra.isPending) {
              setNovaObraAberta(false);
              criarObra.reset();
            }
          }}
          onSubmit={values => criarObra.mutate(values)}
        />
      )}

      {lixeiraAberta && (
        <div className="xl-modal-backdrop" role="dialog" aria-modal="true">
          <div className="xl-modal xl-lixeira">
            <div className="xl-modal-head"><div><strong>Lixeira de obras</strong><span>As obras permanecem preservadas até serem restauradas.</span></div><button type="button" onClick={() => setLixeiraAberta(false)}><X size={16}/></button></div>
            {(lixeira.data ?? []).length === 0 ? <div className="xl-lixeira-vazia">A lixeira está vazia.</div> : <div className="xl-lixeira-lista">{(lixeira.data ?? []).map(o => <div className="xl-lixeira-item" key={o.id}><div><strong>{o.name}</strong><small>{o.code} · {o.deletedAt ? new Date(o.deletedAt).toLocaleString("pt-BR") : "—"}</small></div><button type="button" disabled={restaurarObra.isPending} onClick={() => restaurarObra.mutate({ projectId: o.id })}>Restaurar</button></div>)}</div>}
          </div>
        </div>
      )}
      {obraParaExcluir && (
        <div className="xl-modal-backdrop" role="dialog" aria-modal="true">
          <div className="xl-modal xl-confirm-exclusao">
            <div className="xl-modal-head"><div><strong>Enviar obra para a lixeira</strong><span>Nenhum dado será apagado. Digite exatamente o nome da obra para confirmar.</span></div><button type="button" onClick={() => { setObraParaExcluir(null); setConfirmacaoExclusao(""); }}><X size={16}/></button></div>
            <p className="xl-exclusao-nome">{obraParaExcluir.name}</p>
            <input autoFocus value={confirmacaoExclusao} onChange={e => setConfirmacaoExclusao(e.target.value)} placeholder="Digite o nome exato da obra" />
            <button type="button" className="xl-btn-perigo" disabled={confirmacaoExclusao !== obraParaExcluir.name || moverParaLixeira.isPending} onClick={() => moverParaLixeira.mutate({ projectId: obraParaExcluir.id, confirmationName: confirmacaoExclusao })}>{moverParaLixeira.isPending ? "Enviando…" : "Enviar para a lixeira"}</button>
          </div>
        </div>
      )}

      {destino === "config" ? (
        <CentralComandoArquimedes />
      ) : destino === "catalogo" ? (
        <AbaCatalogo />
      ) : user === undefined ? (
        // A sessão ainda está sendo lida. `undefined` é espera; `null` é
        // ausência. Confundir os dois é o que prendia a tela.
        <SemSessao carregando />
      ) : !user ? (
        <SemSessao carregando={false} />
      ) : !projetoId ? (
        <SemObra carregando={obras.isPending} temObras={lista.length > 0} />
      ) : (
        <>
          <Obra projetoId={projetoId} obra={obra!.name} localizacao={obra!.location ?? ""} descricao={obra!.descricao ?? ""} tipoDeObra={obra!.tipoDeObra ?? ""} aba={aba} onAba={setAba} />
          {/*
            O agente é janela flutuante sobre as abas, e não uma sétima aba: a
            pergunta "como está a minha obra?" não pode ser mais um lugar para
            ir. Ele recebe `aba` para saber o que está aberto, que é informação
            que só o dono da tela tem.
          */}
          <JanelaAgente projetoId={projetoId} obra={obra!.name} abaAtual={aba} />
        </>
      )}
    </div>
  );
}

/** A obra: navegação lateral recolhível e conteúdo central. */
function Obra({
  projetoId,
  obra,
  localizacao,
  descricao,
  tipoDeObra,
  aba,
  onAba,
}: {
  projetoId: number;
  obra: string;
  localizacao: string;
  descricao: string;
  tipoDeObra: string;
  aba: IdDaAba;
  onAba: (aba: IdDaAba) => void;
}) {
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  const grade = trpc.planning.grade.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );

  const calendario: WorkCalendar = CALENDARIO_CORRIDO;
  const hoje: IsoDate = grade.data?.hoje ?? localIsoDe(new Date());
  const linhas: EntradaDaLinha[] = (grade.data?.linhas ?? []).map(l => ({
    codigo: l.codigo,
    atividade: l.atividade,
    frente: l.frente,
    pavimento: l.pavimento,
    inicio: l.inicio,
    duracao: l.duracao,
    quantidade: l.quantidade,
    unidade: l.unidade,
    executado: l.executado,
  }));
  const agregado: AgregadoDoCronograma | undefined = grade.data?.agregado;
  const idPorCodigo = new Map<string, number>(Object.entries(grade.data?.idsPorCodigo ?? {}));
  const exemploPorCodigo = new Set(Object.keys(grade.data?.exemploPorCodigo ?? {}));
  const definicao = ABAS.find(a => a.id === aba);

  const icones: Record<string, ReactNode> = {
    dashboard: <HomeIcon size={17} />,
    escopo: <ClipboardList size={17} />,
    eap: <TreePine size={17} />,
    atividades: <ListTodo size={17} />,
    dependencias: <GitBranch size={17} />,
    cpm: <Network size={17} />,
    baseline: <LockKeyhole size={17} />,
    gantt: <BarChart3 size={17} />,
    "linha-balanco": <Activity size={17} />,
    producao: <Activity size={17} />,
    suprimentos: <Package size={17} />,
    financeiro: <WalletCards size={17} />,
    riscos: <ShieldAlert size={17} />,
    "curva-s": <BarChart3 size={17} />,
  };

  const grupos = [
    { titulo: "VISÃO GERAL", ids: ["dashboard"] },
    { titulo: "PLANEJAMENTO", ids: ["escopo", "eap", "atividades", "dependencias", "cpm", "baseline"] },
    { titulo: "CRONOGRAMA", ids: ["gantt", "linha-balanco"] },
    { titulo: "CONTROLE", ids: ["producao", "suprimentos", "financeiro", "riscos", "curva-s"] },
  ];

  const etapaAtual = ({
    dashboard: "Visão geral", escopo: "Escopo", eap: "EAP", atividades: "Atividades",
    dependencias: "Dependências", cpm: "CPM / Caminho crítico", baseline: "Baseline",
    gantt: "Gantt", "linha-balanco": "Linha de Balanço", producao: "Produção",
    suprimentos: "Suprimentos", financeiro: "Orçamento e Custos", riscos: "Riscos", "curva-s": "Curva S"
  } as Record<string, string>)[aba] ?? aba;

  return (
    <div className={`xl-pasta xl-pasta-sidebar${sidebarRecolhida ? " sidebar-recolhida" : ""}`}>
      <aside className="xl-sidebar" aria-label="Navegação da obra">
        <div className="xl-sidebar-head">
          <div className="xl-sidebar-brand">
            <Layers3 size={17} />
            {!sidebarRecolhida && <div><strong>{obra}</strong><span>Planejamento da obra</span></div>}
          </div>
          <button type="button" className="xl-sidebar-toggle" onClick={() => setSidebarRecolhida(v => !v)} aria-label={sidebarRecolhida ? "Expandir menu" : "Recolher menu"} title={sidebarRecolhida ? "Expandir menu" : "Recolher menu"}>
            {sidebarRecolhida ? <Menu size={17} /> : <Menu size={17} />}
          </button>
        </div>

        <nav className="xl-sidebar-nav">
          {grupos.map(grupo => (
            <div className="xl-sidebar-group" key={grupo.titulo}>
              {!sidebarRecolhida && <div className="xl-sidebar-label">{grupo.titulo}</div>}
              {grupo.ids.map(id => {
                const a = ABAS.find(item => item.id === id);
                if (!a) return null;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`xl-sidebar-item${a.id === aba ? " ativa" : ""}`}
                    onClick={() => onAba(a.id)}
                    title={sidebarRecolhida ? a.rotulo : (a.falta ?? a.rotulo)}
                    aria-current={a.id === aba ? "page" : undefined}
                  >
                    {icones[a.id] ?? <Activity size={17} />}
                    {!sidebarRecolhida && <span>{a.rotulo}</span>}
                    {!sidebarRecolhida && a.status === "pendente" && (
  <span className="xl-sidebar-status" title={a.falta ?? "Etapa ainda não disponível"} aria-label="Etapa pendente">●</span>
)}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

      </aside>

      <main className="xl-area xl-area-sidebar">
        <div className="arquimedes-workbar">
          <div className="arquimedes-workbar-title">
            <span className="arquimedes-kicker">PLANEJAMENTO DA OBRA</span>
          </div>
          <div className="arquimedes-trilha" aria-label="Fluxo do planejamento">
            <span className="arquimedes-trilha-label">Fluxo:</span>
            {["Escopo", "EAP", "Atividades", "Dependências", "CPM", "Baseline"].map((etapa, index) => (
              <Fragment key={etapa}>
                {index > 0 && <span className="arquimedes-trilha-seta">→</span>}
                <span className={etapaAtual === etapa ? "ativo" : ""}>{etapa}</span>
              </Fragment>
            ))}
          </div>
          <div className="arquimedes-workbar-actions">
            <button type="button" title="Pesquisar na obra"><Search size={15} /></button>
            <button type="button" title="Notificações"><Bell size={15} /></button>
            <button type="button" title="Configurações"><Settings2 size={15} /></button>
          </div>
        </div>
        <div className="arquimedes-content">
        {aba === "dashboard" ? (
          <PainelDoCronograma agregado={agregado} projetoId={projetoId} temExemplo={Object.keys(grade.data?.exemploPorCodigo ?? {}).length > 0} />
        ) : aba === "escopo" ? (
          <EscopoInicial projetoId={projetoId} obra={obra} localizacao={localizacao} descricao={descricao} tipoDeObra={tipoDeObra} />
        ) : aba === "eap" ? (
          <AbaEap projetoId={projetoId} />
        ) : aba === "atividades" ? (
          <PainelPlanejamento projetoId={projetoId} />
        ) : aba === "dependencias" ? (
          <AbaDependencias projetoId={projetoId} />
        ) : aba === "cpm" ? (
          <AbaCpm projetoId={projetoId} />
        ) : aba === "baseline" ? (
          <AbaBaseline projetoId={projetoId} />
        ) : aba === "gantt" ? (
          <VisualizacaoPlanejamento projetoId={projetoId} linhas={linhas} inicioObra={grade.data?.inicioObra ?? null} hoje={hoje} view="gantt" />
        ) : aba === "linha-balanco" ? (
          <VisualizacaoPlanejamento projetoId={projetoId} linhas={linhas} inicioObra={grade.data?.inicioObra ?? null} hoje={hoje} view="lob" />
        ) : aba === "producao" ? (
          <AbaProducao projetoId={projetoId} />
        ) : (
          <AbaVazia titulo={definicao?.rotulo ?? aba} falta={definicao?.falta ?? ""} />
        )}
        </div>
      </main>
    </div>
  );
}

/** Escopo: workspace do que a obra contém, entrega e deixa de entregar. */
function EscopoInicial({ projetoId, obra, localizacao, descricao, tipoDeObra }: { projetoId: number; obra: string; localizacao: string; descricao: string; tipoDeObra: string }) {
  const utils = trpc.useUtils();
  const [editando, setEditando] = useState(false);
  const [descricaoEditada, setDescricaoEditada] = useState(descricao);
  const [localizacaoEditada, setLocalizacaoEditada] = useState(localizacao);
  const [tipoDeObraEditado, setTipoDeObraEditado] = useState(tipoDeObra);
  useEffect(() => {
    setDescricaoEditada(descricao);
    setLocalizacaoEditada(localizacao);
    setTipoDeObraEditado(tipoDeObra);
  }, [descricao, localizacao, tipoDeObra]);
  const salvarEscopo = trpc.projects.updateScope.useMutation({
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      setEditando(false);
    },
  });
  const grade = trpc.planning.grade.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const linhas = grade.data?.linhas ?? [];
  const atividades = linhas.filter(l => !String(l.codigo ?? "").toLowerCase().includes("exemplo"));
  const frentes = Array.from(new Set(atividades.map(l => l.frente).filter(Boolean)));
  const pavimentos = Array.from(new Set(atividades.map(l => l.pavimento).filter(Boolean)));
  const unidades = atividades.reduce((sum, l) => sum + (Number(l.quantidade) || 0), 0);
  const temPlanejamento = atividades.length > 0;

  const elementos = [
    { codigo: "E.01", nome: "Edificação / intervenção principal", categoria: "ENTREGÁVEL", detalhe: temPlanejamento ? "Rastreada no planejamento atual" : "Aguardando definição no cadastro do escopo", status: temPlanejamento ? "Identificado" : "Pendente" },
    { codigo: "E.02", nome: "Sistemas e serviços da obra", categoria: "COMPONENTES", detalhe: frentes.length ? String(frentes.length) + " frente(s) identificada(s) no planejamento" : "Ainda não há frentes derivadas", status: frentes.length ? "Rastreado" : "A definir" },
    { codigo: "E.03", nome: "Localização / setores de execução", categoria: "LOCAL", detalhe: pavimentos.length ? String(pavimentos.length) + " local(is)/pavimento(s) no planejamento" : "Localização executiva ainda não derivada", status: pavimentos.length ? "Rastreado" : "A definir" },
    { codigo: "E.04", nome: "Quantidades associadas", categoria: "QUANTITATIVOS", detalhe: unidades > 0 ? String(unidades) + " unidade(s) informada(s) nas linhas atuais" : "Nenhuma quantidade disponível nas linhas atuais", status: unidades > 0 ? "Parcial" : "Pendente" },
  ];

  return (
    <div className="scopo-workspace">
      <header className="scopo-workspace-header">
        <div className="scopo-workspace-title">
          <span className="scopo-kicker">PLANEJAMENTO · ESCOPO</span>
          <h1>O que a obra entrega</h1>
          <p>{obra} · definição do que existe na obra, seus limites e o que será transformado em EAP.</p>
        </div>
        <div className="scopo-header-actions">
          {editando ? (
            <>
              <button type="button" className="scopo-btn secondary" disabled={salvarEscopo.isPending || localizacaoEditada.trim().length < 2} onClick={() => salvarEscopo.mutate({ projectId: projetoId, location: localizacaoEditada.trim(), tipoDeObra: tipoDeObraEditado || null, descricao: descricaoEditada.trim() })}>{salvarEscopo.isPending ? "Salvando…" : "Salvar escopo"}</button>
              <button type="button" className="scopo-btn secondary" disabled={salvarEscopo.isPending} onClick={() => { setDescricaoEditada(descricao); setLocalizacaoEditada(localizacao); setTipoDeObraEditado(tipoDeObra); setEditando(false); salvarEscopo.reset(); }}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="scopo-btn secondary" onClick={() => setEditando(true)}><ClipboardList size={14}/> Editar escopo</button>
          )}
          <button type="button" className="scopo-btn secondary" onClick={() => window.dispatchEvent(new CustomEvent("abrir-arquimedes"))}><Bot size={14}/> Analisar com Arquimedes</button>
        </div>
      </header>

      <section className="scopo-trace-grid">
        <details open className="scopo-detail">
          <summary>Escopo declarado da obra</summary>
          <div className="scopo-detail-body">
            <p><strong>Natureza:</strong> {({ edificio: "Edificação / construção nova", reforma: "Reforma", pavimentacao: "Pavimentação", saneamento: "Saneamento / infraestrutura", todos: "Múltiplas frentes" } as Record<string, string>)[tipoDeObra] ?? "A confirmar"}</p>
            <p><strong>Localização cadastrada:</strong> {localizacao || "Não informada"}</p>
            <p><strong>Descrição original:</strong></p>
            <p>{descricao.trim() || "Ainda não há uma descrição formal cadastrada para esta obra."}</p>
          </div>
        </details>
      </section>
      {editando && (
        <section className="scopo-detail scopo-edit-form">
          <div className="scopo-detail-body">
            <label><strong>Localização da obra</strong><input value={localizacaoEditada} onChange={event => setLocalizacaoEditada(event.target.value)} minLength={2} maxLength={180} placeholder="Cidade, endereço ou região" /></label>
            <label><strong>Natureza da obra</strong>
              <select value={tipoDeObraEditado} onChange={event => setTipoDeObraEditado(event.target.value)}>
                <option value="">A confirmar</option>
                <option value="edificio">Edificação / construção nova</option>
                <option value="reforma">Reforma</option>
                <option value="pavimentacao">Pavimentação</option>
                <option value="saneamento">Saneamento / infraestrutura</option>
                <option value="todos">Múltiplas frentes</option>
              </select>
            </label>
            <label><strong>Descrição formal do escopo</strong>
              <textarea value={descricaoEditada} onChange={event => setDescricaoEditada(event.target.value)} maxLength={4000} rows={7} placeholder="Descreva entregas, inclusões, exclusões, premissas, limites contratuais e itens ainda a confirmar. Separe fatos conhecidos de hipóteses." />
              <small>{descricaoEditada.length}/4000 caracteres. Não informe quantidades ou sistemas que ainda não foram confirmados.</small>
            </label>
            {salvarEscopo.isError && <p role="alert">{salvarEscopo.error.message}</p>}
          </div>
        </section>
      )}

      <div className="scopo-flow" aria-label="Fluxo do planejamento">
        <strong>Obra</strong><span>→</span><span className="ativo">Escopo</span><span>→</span><span>EAP</span><span>→</span><span>Quantitativos</span><span>→</span><span>Orçamento</span><span>→</span><span>Atividades</span>
      </div>

      <section className="scopo-metrics" aria-label="Indicadores do escopo">
        <div><span>ELEMENTOS</span><strong>{elementos.length}</strong><small>camadas do escopo visíveis</small></div>
        <div><span>FRENTES</span><strong>{frentes.length}</strong><small>derivadas do planejamento atual</small></div>
        <div><span>LOCAIS</span><strong>{pavimentos.length}</strong><small>setores/pavimentos encontrados</small></div>
        <div className={!temPlanejamento ? "attention" : ""}><span>RASTREABILIDADE</span><strong>{temPlanejamento ? "PARCIAL" : "AGUARDANDO"}</strong><small>{temPlanejamento ? "há dados para ligar ao planejamento" : "escopo ainda sem dados executivos"}</small></div>
      </section>

      <div className="scopo-toolbar">
        <div className="scopo-toolbar-title"><strong>Mapa do escopo</strong><span>Fonte conceitual da EAP; não substitui a estrutura analítica.</span></div>
        <span className="scopo-readonly">VISÃO DERIVADA · SEM INVENTAR DADOS</span>
      </div>

      <section className="scopo-table-wrap">
        <table className="scopo-table">
          <thead><tr><th className="codigo-col">CÓD.</th><th className="elemento-col">ELEMENTO DA OBRA</th><th>CATEGORIA</th><th>O QUE ESTÁ DEFINIDO</th><th>STATUS</th></tr></thead>
          <tbody>
            {elementos.map(item => (
              <tr key={item.codigo}>
                <td className="mono">{item.codigo}</td>
                <td><strong>{item.nome}</strong></td>
                <td><span className="scopo-tag">{item.categoria}</span></td>
                <td>{item.detalhe}</td>
                <td><span className={"scopo-status" + (item.status === "Pendente" || item.status === "A definir" ? " pendente" : "")}>{item.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="scopo-trace-grid">
        <details open className="scopo-detail">
          <summary>Limites e critérios do escopo</summary>
          <div className="scopo-detail-body">
            <p><strong>Inclusões:</strong> devem ser confirmadas pelo engenheiro antes da aprovação do escopo.</p>
            <p><strong>Exclusões:</strong> devem ser registradas explicitamente para evitar que a EAP absorva trabalho não contratado.</p>
            <p><strong>Premissas:</strong> ficam separadas de fatos confirmados; uma premissa não vira requisito técnico automaticamente.</p>
          </div>
        </details>
        <details open className="scopo-detail">
          <summary>Rastreabilidade para o planejamento</summary>
          <div className="scopo-detail-body">
            <div className="scopo-trace"><span>ESCOPO</span><b>→</b><span>EAP</span><b>→</b><span>QUANTITATIVOS</span><b>→</b><span>ATIVIDADES</span></div>
            <p>{temPlanejamento ? "Já existem dados de planejamento que podem receber vínculos de escopo. A aprovação deve ocorrer sem preencher informações ausentes por inferência." : "Ainda não há dados executivos suficientes para declarar cobertura do escopo. Isso não é aprovação."}</p>
          </div>
        </details>
      </section>

      <footer className="scopo-footer">
        <span><strong>Regra:</strong> escopo define o que será entregue; EAP organiza e controla esse escopo.</span>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("abrir-arquimedes"))}><Bot size={13}/> Pedir análise do Arquimedes</button>
      </footer>
    </div>
  );
}
/** Aba sem conteúdo: diz o que falta e por quê. */
function AbaVazia({ titulo, falta }: { titulo: string; falta: string }) {
  return (
    <div className="xl-vazia-folha">
      <h3>{titulo} ainda não existe</h3>
      {falta && <p className="xl-vazia-falta">{falta}</p>}
      <p className="xl-vazia-nota">
        A aba não desenha tela vazia que pareça funcionando. O que falta está
        escrito acima porque é o caminho, não um prazo.
      </p>
    </div>
  );
}

/**
 * A tela de entrada. É o ramo que faltava.
 *
 * Sem sessão, `projects.list` roda com `enabled: false` e o React Query marca
 * a query como `pending` para sempre — não "carregando", "nunca vai carregar".
 * A tela lia esse `isPending` e escrevia "Carregando as obras…" para sempre, sem
 * botão, sem erro e sem nenhuma requisição na rede. O usuário via uma página
 * que parecia trabalhar e não tinha caminho nenhum.
 *
 * Aqui a espera é de `user`, que é o que realmente decide se a consulta pode
 * partir. Enquanto `user` é `undefined` a sessão está sendo lida; quando é
 * `null`, não há sessão, e isso é um estado, não uma espera.
 */
function SemSessao({ carregando }: { carregando: boolean }) {
  return (
    <div className="xl-area">
      <div className="xl-vazia-folha">
        <h3>{carregando ? "Lendo a sessão…" : "Entre para ver as obras"}</h3>
        {!carregando && (
          <>
            <p className="xl-vazia-falta">
              As obras são da sua conta. O acesso é pelo GitHub.
            </p>
            <button
              type="button"
              className="xl-btn-entrar"
              onClick={startLogin}
            >
              Entrar com GitHub
            </button>
          </>
        )}
      </div>
    </div>
  );
}

type NovaObraValues = {
  name: string;
  location: string;
  plannedStart?: Date;
  plannedFinish?: Date;
  tipoDeObra: "edificio" | "reforma" | "pavimentacao" | "saneamento" | "todos";
  descricao?: string;
};

function NovaObraDialog({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: NovaObraValues) => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedFinish, setPlannedFinish] = useState("");
  const [tipoDeObra, setTipoDeObra] =
    useState<NovaObraValues["tipoDeObra"]>("edificio");
  const [descricao, setDescricao] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !location.trim() || !descricao.trim()) return;
    onSubmit({
      name: name.trim(),
      location: location.trim(),
      plannedStart: plannedStart ? new Date(`${plannedStart}T12:00:00`) : undefined,
      plannedFinish: plannedFinish ? new Date(`${plannedFinish}T12:00:00`) : undefined,
      tipoDeObra,
      descricao: descricao.trim(),
    });
  }

  return (
    <div
      className="nova-obra-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="nova-obra-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-obra-titulo"
        onSubmit={submit}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="nova-obra-header">
          <div>
            <div className="nova-obra-kicker"><Sparkles size={14} /> ARQUIMEDES · PLANEJAMENTO</div>
            <h2 id="nova-obra-titulo">Nova obra</h2>
            <p>Descreva o empreendimento. O Arquimedes usa esse contexto para propor a primeira EAP.</p>
          </div>
          <button
            type="button"
            className="nova-obra-fechar"
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="nova-obra-fluxo">
          <div className="nova-obra-fluxo-item ativo"><span>1</span><div><strong>Descrever</strong><small>escopo da obra</small></div></div>
          <div className="nova-obra-fluxo-linha" />
          <div className="nova-obra-fluxo-item"><span>2</span><div><strong>Propor</strong><small>Arquimedes monta a EAP</small></div></div>
          <div className="nova-obra-fluxo-linha" />
          <div className="nova-obra-fluxo-item"><span>3</span><div><strong>Revisar</strong><small>engenheiro valida</small></div></div>
        </div>

        <div className="nova-obra-body">
          <section className="nova-obra-section">
            <div className="nova-obra-section-title">
              <span className="nova-obra-numero">01</span>
              <div><strong>Identificação</strong><small>Dados básicos para localizar a obra.</small></div>
            </div>

            <div className="nova-obra-grid">
              <label>
                <span>Nome da obra <b>*</b></span>
                <input required minLength={2} maxLength={180} value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="Ex.: Reservatório Elevado – Unidade Norte" autoFocus />
              </label>
              <label>
                <span>Localização <b>*</b></span>
                <input required minLength={2} maxLength={180} value={location}
                  onChange={event => setLocation(event.target.value)}
                  placeholder="Cidade, endereço ou região" />
              </label>
            </div>

            <label className="nova-obra-tipo">
              <span>Natureza da obra</span>
              <select value={tipoDeObra}
                onChange={event => setTipoDeObra(event.target.value as NovaObraValues["tipoDeObra"])}>
                <option value="edificio">Edificação / construção nova</option>
                <option value="reforma">Reforma</option>
                <option value="pavimentacao">Pavimentação</option>
                <option value="saneamento">Saneamento / infraestrutura</option>
                <option value="todos">Múltiplas frentes</option>
              </select>
            </label>
          </section>

          <section className="nova-obra-section nova-obra-escopo">
            <div className="nova-obra-section-title">
              <span className="nova-obra-numero">02</span>
              <div><strong>Escopo da obra</strong><small>É daqui que o Arquimedes vai partir para propor a EAP.</small></div>
            </div>

            <label>
              <span>O que será construído? <b>*</b></span>
              <textarea
                required
                minLength={20}
                maxLength={8000}
                rows={7}
                value={descricao}
                onChange={event => setDescricao(event.target.value)}
                placeholder={"Descreva o empreendimento com suas próprias palavras.\n\nEx.: Construção de um reservatório elevado de concreto armado, incluindo fundações, estrutura, instalações hidráulicas e elétricas, urbanização e testes. A adutora terá aproximadamente 2 km e ligará o reservatório à rede existente."}
              />
              <div className="nova-obra-contador">{descricao.length}/8000</div>
            </label>

            <div className="nova-obra-dica">
              <Sparkles size={15} />
              <div>
                <strong>Não precisa montar a EAP agora.</strong>
                <span>Informe o que você sabe: sistemas, locais, trechos, unidades, quantidades, limites do contrato e entregas esperadas. O Arquimedes identifica lacunas e propõe a decomposição.</span>
              </div>
            </div>
          </section>

          <section className="nova-obra-section">
            <div className="nova-obra-section-title">
              <span className="nova-obra-numero">03</span>
              <div><strong>Prazo inicial</strong><small>Pode ser preenchido agora ou definido durante o planejamento.</small></div>
            </div>

            <div className="nova-obra-grid">
              <label>
                <span>Início previsto</span>
                <input type="date" value={plannedStart}
                  onChange={event => setPlannedStart(event.target.value)} />
              </label>
              <label>
                <span>Término previsto</span>
                <input type="date" value={plannedFinish}
                  onChange={event => setPlannedFinish(event.target.value)} />
              </label>
            </div>

            {plannedStart && plannedFinish && plannedFinish <= plannedStart && (
              <p className="nova-obra-erro">O término deve ser posterior ao início.</p>
            )}
          </section>

          {error && <div className="nova-obra-alert" role="alert">{error}</div>}
        </div>

        <footer className="nova-obra-footer">
          <div className="nova-obra-footer-info">
            <Sparkles size={15} />
            <span>Ao criar, a obra entra em <strong>EAP proposta</strong>. Nada será aprovado ou congelado automaticamente.</span>
          </div>
          <div className="nova-obra-acoes">
            <button type="button" onClick={onClose} disabled={busy} className="nova-obra-cancelar">Cancelar</button>
            <button
              type="submit"
              disabled={busy || !name.trim() || !location.trim() || descricao.trim().length < 20 || (!!plannedStart && !!plannedFinish && plannedFinish <= plannedStart)}
              className="nova-obra-criar"
            >
              {busy ? "Criando obra…" : "Criar e abrir EAP"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}


const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  minHeight: 40,
  padding: "9px 11px",
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  background: "#fff",
  color: "#0f172a",
  fontSize: 14,
};

const primaryButtonStyle = {
  border: 0,
  borderRadius: 7,
  padding: "10px 16px",
  background: "#176b87",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  padding: "10px 16px",
  background: "#fff",
  color: "#334155",
  fontWeight: 600,
  cursor: "pointer",
};

function SemObra({ carregando, temObras }: { carregando: boolean; temObras: boolean }) {
  return (
    <div className="xl-area">
      <div className="xl-vazia-folha">
        <h3>{carregando ? "Carregando as obras…" : "Nenhuma obra aqui"}</h3>
        {!carregando && !temObras && (
          <>
            <p className="xl-vazia-falta">
              Não há obra cadastrada. Crie a primeira obra para começar.
            </p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("abrir-nova-obra"))}
              className="xl-btn-entrar"
            >
              + Criar obra
            </button>
          </>
        )}
      </div>
    </div>
  );
}
