import { Layers3, Plus, Sparkles, X, Trash2, Menu, Home as HomeIcon, ClipboardList, TreePine, ListTodo, BarChart3, Activity, Package, WalletCards, ShieldAlert, Bot, GitBranch, Network, LockKeyhole, Search, FileText, LogOut, ArrowRight, ArrowLeft, Ellipsis } from "lucide-react";
import { FormEvent, Fragment, ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
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
import { DocumentosDaObra } from "@/components/DocumentosDaObra";
import { AbaCurvaS } from "@/components/AbaCurvaS";
import { AbaRiscos } from "@/components/AbaRiscos";
import { AbaSuprimentos } from "@/components/AbaSuprimentos";
import { AbaOrcamento } from "@/components/AbaOrcamento";
import { PainelPlanejamento } from "@/components/PainelPlanejamento";
import { PainelDoCronograma } from "@/components/PainelDoCronograma";
import { VisualizacaoPlanejamento } from "@/components/VisualizacaoPlanejamento";
import { ABAS, type IdDaAba } from "@/modules/abas";
import type { AgregadoDoCronograma, EntradaDaLinha } from "@shared/cronograma-colunas";
import { CALENDARIO_CORRIDO } from "@shared/cronograma-colunas";
import type { IsoDate, WorkCalendar } from "@shared/work-calendar";
import "@/planilha.css";
import "@/eap.css";
// mobile.css e campo-tipografia.css NAO sao importados aqui de proposito: eles
// tem de ser a ultima folha do bundle, e qualquer CSS importado de dentro de App
// entra antes de index.css. Eles sao importados no fim de main.tsx.

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

type TipoDeObra = "edificio" | "reforma" | "pavimentacao" | "saneamento" | "todos";

/**
 * O fluxo do planejamento, na ordem em que ele acontece.
 *
 * Serve para duas coisas: mostrar em que etapa a obra está e deixar pular direto
 * para a etapa anterior ou seguinte sem caçar no menu. Fora dessas abas a trilha
 * não aparece — num painel de custos "Escopo → EAP" só ocupa espaço.
 */
const etapasDoPlanejamento: { etapa: string; aba: IdDaAba }[] = [
  { etapa: "Escopo", aba: "escopo" },
  { etapa: "EAP", aba: "eap" },
  { etapa: "Atividades", aba: "atividades" },
  { etapa: "Dependências", aba: "dependencias" },
  { etapa: "CPM", aba: "cpm" },
  { etapa: "Baseline", aba: "baseline" },
];

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [rotaDaObra, parametrosDaRota] = useRoute("/obra/:id");
  const ehRotaDeObra = Boolean(rotaDaObra);
  const idNaUrl = ehRotaDeObra ? Number(parametrosDaRota?.id) : null;
  const [aba, setAba] = useState<IdDaAba>("dashboard");
  const [novaObraAberta, setNovaObraAberta] = useState(false);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [obraParaExcluir, setObraParaExcluir] = useState<{ id: number; name: string } | null>(null);
  const [menuAcoesObraAberto, setMenuAcoesObraAberto] = useState(false);
  // Seletor de obra (o botao do topo). Antes a obra so se trocava clicando nos
  // chips da faixa -- no celular so cabia um chip por vez. Agora ha um botao que
  // abre a lista completa, com busca.

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
  const lista: Array<{ id: number; name: string; code: string; location?: string; descricao?: string | null; tipoDeObra?: TipoDeObra | null; cubValor?: string | number | null; cubUf?: string | null; cubMes?: string | null; bdiDeclarado?: string | number | null }> =
    (obras.data as Array<{ id: number; name: string; code: string; location?: string; descricao?: string | null; tipoDeObra?: TipoDeObra | null; cubValor?: string | number | null; cubUf?: string | null; cubMes?: string | null; bdiDeclarado?: string | number | null }> | undefined) ?? [];
  const obra =
    idNaUrl == null || Number.isNaN(idNaUrl)
      ? undefined
      : lista.find(o => o.id === idNaUrl);
  const projetoId = obra?.id ?? null;
  const mostrarTituloDaObra = ehRotaDeObra && Boolean(user);

  const lixeira = trpc.projects.trash.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const moverParaLixeira = trpc.projects.moveToTrash.useMutation({ onSuccess: async () => { await Promise.all([obras.refetch(), lixeira.refetch()]); setObraParaExcluir(null); setLocation("/obras"); } });
  const restaurarObra = trpc.projects.restoreFromTrash.useMutation({ onSuccess: () => Promise.all([obras.refetch(), lixeira.refetch()]) });

  const criarDemo = trpc.projects.createDemoGantt.useMutation({
    onSuccess: async created => {
      await obras.refetch();
      setLocation(`/obra/${created.id}`);
      setAba("gantt");
    },
  });

  const criarObra = trpc.projects.create.useMutation({
    onSuccess: async created => {
      await obras.refetch();
      setLocation(`/obra/${created.id}`);
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
    const openConfig = () => setAba("comando");
    const openEap = () => setAba("eap");
    const openAtividades = () => setAba("atividades");
    const openAba = (evento: Event) => {
      const alvo = (evento as CustomEvent<{ aba?: string }>).detail?.aba;
      if (alvo) setAba(alvo as Parameters<typeof setAba>[0]);
    };
    window.addEventListener("abrir-configuracao-llm", openConfig);
    window.addEventListener("abrir-aba-eap", openEap);
    window.addEventListener("abrir-aba-atividades", openAtividades);
    window.addEventListener("abrir-aba", openAba);
    return () => {
      window.removeEventListener("abrir-configuracao-llm", openConfig);
      window.removeEventListener("abrir-aba-eap", openEap);
      window.removeEventListener("abrir-aba-atividades", openAtividades);
      window.removeEventListener("abrir-aba", openAba);
    };
  }, []);

  return (
    <div className={`xl-app${!ehRotaDeObra && user ? " xl-app--portfolio" : ""}`}>
      {mostrarTituloDaObra && obra && (
        <header className="arq-context-header">
          <div className="arq-context-top">
            <div className="arq-context-brand">
              <Layers3 size={20} aria-hidden="true" />
              <strong>ARQUIMEDES</strong>
            </div>
            <div className="xl-contexto-obra-acoes">
              {user?.role === "admin" && (
                <div className="xl-contexto-menu-acoes">
                  <button
                    type="button"
                    className="xl-contexto-menu-botao"
                    aria-label="Mais ações da obra"
                    aria-haspopup="menu"
                    aria-expanded={menuAcoesObraAberto}
                    title="Mais ações da obra"
                    onClick={() => setMenuAcoesObraAberto(aberto => !aberto)}
                  >
                    <Ellipsis size={19} aria-hidden="true" />
                  </button>
                  {menuAcoesObraAberto && (
                    <div className="xl-contexto-menu-painel" role="menu" aria-label="Ações da obra">
                      <span className="xl-contexto-menu-titulo">Ações da obra</span>
                      <button
                        type="button"
                        role="menuitem"
                        className="xl-contexto-menu-perigo"
                        onClick={() => {
                          setMenuAcoesObraAberto(false);
                          setObraParaExcluir({ id: obra.id, name: obra.name });
                        }}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Enviar para a lixeira
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                className="xl-sair-obra"
                onClick={() => {
                  setAba("dashboard");
                  setLocation("/obras");
                }}
                title="Sair da obra e voltar à seleção de obras"
              >
                <ArrowLeft size={16} /> Sair da obra
              </button>
            </div>
          </div>
          <div className="arq-context-project">
            <div className="arq-context-project-copy">
              <span>OBRA ATIVA</span>
              <strong>{obra.name}</strong>
              {obra.code && <small>Código: {obra.code}</small>}
            </div>
            <button
              type="button"
              className="xl-sidebar-toggle arq-context-collapse"
              onClick={() => window.dispatchEvent(new CustomEvent("alternar-recolhimento-sidebar"))}
              aria-label="Recolher ou expandir menu"
              title="Recolher ou expandir menu"
            >
              <Menu size={17} aria-hidden="true" />
            </button>
          </div>
        </header>
      )}

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
        <div className="xl-modal-backdrop" role="dialog" aria-modal="true" aria-label="Enviar obra para a lixeira">
          <div className="xl-modal xl-confirm-exclusao">
            <div className="xl-modal-head">
              <div>
                <strong>Enviar para a lixeira</strong>
                <span>Nada é apagado. A obra vai para a lixeira e pode ser restaurada depois.</span>
              </div>
              <button type="button" onClick={() => setObraParaExcluir(null)} aria-label="Fechar"><X size={16}/></button>
            </div>
            <p className="xl-exclusao-nome">{obraParaExcluir.name}</p>
            {/*
              Antes o botao so habilitava se o nome digitado fosse identico ao da
              obra. O nome tem travessao ("Obra — Lote 1"), entao no teclado do
              celular isso e praticamente impossivel; o botao ficava cinza e nada
              explicava o porque. Agora e uma confirmacao explicita de dois
              botoes, com o nome visivel, e o erro da operacao aparece aqui.
            */}
            {moverParaLixeira.error && (
              <p className="xl-exclusao-erro">{moverParaLixeira.error.message}</p>
            )}
            <div className="xl-exclusao-acoes">
              <button
                type="button"
                className="xl-btn-neutro"
                onClick={() => setObraParaExcluir(null)}
                disabled={moverParaLixeira.isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="xl-btn-perigo"
                disabled={moverParaLixeira.isPending}
                onClick={() =>
                  moverParaLixeira.mutate({
                    projectId: obraParaExcluir.id,
                    confirmationName: obraParaExcluir.name,
                  })
                }
              >
                {moverParaLixeira.isPending ? "Enviando…" : "Enviar para a lixeira"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!ehRotaDeObra && user ? (
        <EscolhaDeObra
          obras={lista.map(o => ({ id: o.id, name: o.name, code: o.code, location: o.location ?? "" }))}
          carregando={obras.isPending}
          onEscolher={id => setLocation(`/obra/${id}`)}
          onNovaObra={() => setNovaObraAberta(true)}
          onObraDemo={() => criarDemo.mutate()}
          criandoDemo={criarDemo.isPending}
        />
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
          <Obra projetoId={projetoId} obra={obra!.name} localizacao={obra!.location ?? ""} descricao={obra!.descricao ?? ""} tipoDeObra={obra!.tipoDeObra ?? ""} cubValor={obra!.cubValor == null ? "" : String(obra!.cubValor)} cubUf={obra!.cubUf ?? ""} cubMes={obra!.cubMes ?? ""} bdiDeclarado={obra!.bdiDeclarado == null ? "" : String(obra!.bdiDeclarado)} aba={aba} onAba={setAba} usuario={user} onLixeira={() => setLixeiraAberta(true)} lixeiraCount={(lixeira.data ?? []).length} />
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

function EscolhaDeObra({ obras, carregando, onEscolher, onNovaObra, onObraDemo, criandoDemo }: {
  obras: Array<{ id: number; name: string; code: string; location: string }>;
  carregando: boolean;
  onEscolher: (id: number) => void;
  onNovaObra: () => void;
  onObraDemo: () => void;
  criandoDemo: boolean;
}) {
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtradas = obras.filter(o =>
    [o.name, o.code, o.location].filter(Boolean).some(valor => String(valor).toLocaleLowerCase("pt-BR").includes(termo)),
  );

  return (
    <main className="arq-obras">
      <div className="arq-obras-fundo" aria-hidden="true" />
      <header className="arq-obras-header">
        <a href="/" className="arq-obras-marca" aria-label="Arquimedes — página inicial">
          <span className="arq-obras-simbolo"><Layers3 size={20} /></span>
          <span><strong>ARQUIMEDES</strong><small>PLANEJAMENTO DE OBRAS</small></span>
        </a>
        <div className="arq-obras-header-meta"><span className="arq-obras-status" /> AMBIENTE DE TRABALHO</div>
      </header>

      <section className="arq-obras-conteudo">
        <div className="arq-obras-intro">
          <div>
            <p className="arq-obras-eyebrow">ESPAÇO DE TRABALHO</p>
            <h1>Suas obras<span>.</span></h1>
            <p className="arq-obras-subtitulo">Selecione um projeto para continuar o planejamento ou inicie uma nova obra.</p>
          </div>
          <div className="arq-obras-acoes">
            <button type="button" className="arq-obras-btn-secundario" onClick={onObraDemo} disabled={criandoDemo}>
              <Sparkles size={16} /> {criandoDemo ? "Preparando demonstração…" : "Ver obra demonstrativa"}
            </button>
            <button type="button" className="arq-obras-btn-primario" onClick={onNovaObra}>
              <Plus size={17} /> Nova obra
            </button>
          </div>
        </div>

        <div className="arq-obras-toolbar">
          <div className="arq-obras-contagem"><strong>{carregando ? "…" : filtradas.length}</strong><span>{filtradas.length === 1 ? "obra" : "obras"} {termo ? "encontradas" : "no seu espaço"}</span></div>
          <label className="arq-obras-busca">
            <Search size={17} aria-hidden="true" />
            <input value={busca} onChange={evento => setBusca(evento.target.value)} placeholder="Buscar por nome, código ou local" aria-label="Buscar obras" />
            {busca && <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca"><X size={15} /></button>}
          </label>
        </div>

        {carregando ? (
          <div className="arq-obras-estado" role="status"><span className="arq-obras-spinner" /><strong>Carregando suas obras</strong><p>Estamos preparando seu espaço de trabalho.</p></div>
        ) : filtradas.length === 0 ? (
          <div className="arq-obras-vazio">
            <span className="arq-obras-vazio-icone"><Layers3 size={27} /></span>
            <h2>{termo ? "Nenhuma obra encontrada" : "Seu espaço começa aqui"}</h2>
            <p>{termo ? "Tente outro nome, código ou local." : "Crie a primeira obra para começar a estruturar a EAP, os quantitativos e o cronograma."}</p>
            {termo ? (
              <button type="button" className="arq-obras-btn-secundario" onClick={() => setBusca("")}>Limpar busca</button>
            ) : (
              <button type="button" className="arq-obras-btn-primario" onClick={onNovaObra}><Plus size={17} /> Criar primeira obra</button>
            )}
          </div>
        ) : (
          <div className="arq-obras-grade">
            {filtradas.map((obra, indice) => (
              <button type="button" className={`arq-obra-card arq-obra-card--${indice % 3}`} key={obra.id} onClick={() => onEscolher(obra.id)}>
                <span className="arq-obra-capa" aria-hidden="true">
                  <span className="arq-obra-capa-grade" />
                  <span className="arq-obra-capa-selo"><Layers3 size={13} /> PROJETO</span>
                  <span className="arq-obra-ilustracao"><span /><span /><span /><span /><span /></span>
                  <span className="arq-obra-capa-rodape">ARQ / {String(indice + 1).padStart(2, "0")}</span>
                </span>
                <span className="arq-obra-info">
                  <span className="arq-obra-codigo">{obra.code || "OBRA SEM CÓDIGO"}</span>
                  <strong className="arq-obra-nome">{obra.name}</strong>
                  <span className="arq-obra-local">{obra.location || "Local não informado"}</span>
                  <span className="arq-obra-abrir">Abrir planejamento <ArrowRight size={15} /></span>
                </span>
              </button>
            ))}
            {!termo && (
              <button type="button" className="arq-obra-nova-card" onClick={onNovaObra}>
                <span className="arq-obra-nova-icone"><Plus size={22} /></span>
                <strong>Adicionar nova obra</strong>
                <span>Comece um novo planejamento</span>
              </button>
            )}
          </div>
        )}

        <footer className="arq-obras-rodape">
          <span><ShieldAlert size={15} /> Cada obra mantém seu próprio planejamento e histórico.</span>
          <span>ARQUIMEDES · ENGENHARIA COM MÉTODO</span>
        </footer>
      </section>
    </main>
  );
}

/** A obra: navegação lateral recolhível e conteúdo central. */
function Obra({
  projetoId,
  obra,
  localizacao,
  descricao,
  tipoDeObra,
  cubValor,
  cubUf,
  cubMes,
  bdiDeclarado,
  aba,
  onAba,
  usuario,
  onLixeira,
  lixeiraCount,
}: {
  projetoId: number;
  obra: string;
  localizacao: string;
  descricao: string;
  tipoDeObra: TipoDeObra | "";
  cubValor: string;
  cubUf: string;
  cubMes: string;
  bdiDeclarado: string;
  aba: IdDaAba;
  onAba: (aba: IdDaAba) => void;
  usuario: { name?: string | null; role?: string | null } | null;
  onLixeira: () => void;
  lixeiraCount: number;
}) {
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  // No celular a sidebar vira DRAWER. Sem isto ela ocupa a largura toda em
  // `position: static` e empurra as abas para fora da tela: o engenheiro abre
  // a obra no telefone e nao consegue navegar. O estado e separado do
  // `sidebarRecolhida` de proposito — recolher (icone) e esconder (drawer) sao
  // coisas diferentes, e misturar as duas quebra o desktop.
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  // Fecha o drawer ao escolher uma aba: senao ele fica por cima do conteudo.
  // Usa o `onAba` recebido por prop — este componente nao tem o `setAba` do
  // pai. Chamar `setAba` aqui nao compila, e foi o que o typecheck pegou.
  const irParaAba = (id: IdDaAba) => {
    onAba(id);
    setMenuMobileAberto(false);
  };

  // O controle de recolher fica no cabeçalho da obra, ao lado do nome.
  useEffect(() => {
    const alternar = () => setSidebarRecolhida(v => !v);
    window.addEventListener("alternar-recolhimento-sidebar", alternar);
    return () => window.removeEventListener("alternar-recolhimento-sidebar", alternar);
  }, []);

  // Fecha com Esc — teclado em tablet/celular com teclado externo.
  useEffect(() => {
    if (!menuMobileAberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuMobileAberto(false); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [menuMobileAberto]);
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
    documentos: <FileText size={17} />,
    suprimentos: <Package size={17} />,
    financeiro: <WalletCards size={17} />,
    riscos: <ShieldAlert size={17} />,
    "curva-s": <BarChart3 size={17} />,
    catalogo: <Package size={17} />,
    comando: <Sparkles size={17} />,
  };

  const grupos = [
    { titulo: "VISÃO GERAL", ids: ["dashboard"] },
    { titulo: "PLANEJAMENTO", ids: ["escopo", "eap", "atividades", "dependencias", "cpm", "baseline"] },
    { titulo: "CRONOGRAMA", ids: ["gantt", "linha-balanco"] },
    // O grupo se chamava "CONTROLE" e continha o item "CONTROLE": o menu
    // mostrava a mesma palavra duas vezes seguidas e parecia item duplicado.
    { titulo: "EXECUÇÃO E CONTROLE", ids: ["producao", "documentos", "suprimentos", "financeiro", "riscos", "curva-s"] },
    { titulo: "SISTEMA", ids: ["catalogo", "comando"] },
  ];

  const etapaAtual = ({
    dashboard: "Painel da obra", escopo: "Escopo", eap: "EAP", atividades: "Atividades",
    dependencias: "Dependências", cpm: "CPM / Caminho crítico", baseline: "Baseline",
    gantt: "Gantt", "linha-balanco": "Linha de Balanço", producao: "Controle",
    documentos: "Documentos",
    suprimentos: "Suprimentos", financeiro: "Orçamento e Custos", riscos: "Riscos",
    "curva-s": "Curva S", catalogo: "Catálogo de Insumos", comando: "Central de Comando"
  } as Record<string, string>)[aba] ?? aba;

  // Barra de campo (so no celular). Sao as quatro telas que se usa de pe, na
  // obra, mais o "Mais" que abre o menu completo. Existe porque o painel nao
  // tinha botao de menu nenhum: o unico hamburguer morava na barra de trabalho,
  // e a barra de trabalho nao aparece no painel — ou seja, no celular o painel
  // era um beco sem saida.
  const atalhosDeCampo: { id: IdDaAba; rotulo: string; icone: ReactNode }[] = [
    { id: "dashboard", rotulo: "Painel", icone: <HomeIcon size={22} aria-hidden="true" /> },
    { id: "producao", rotulo: "Produção", icone: <ClipboardList size={22} aria-hidden="true" /> },
    { id: "gantt", rotulo: "Gantt", icone: <BarChart3 size={22} aria-hidden="true" /> },
    { id: "financeiro", rotulo: "Custos", icone: <WalletCards size={22} aria-hidden="true" /> },
  ];

  return (
    <div className={`xl-pasta xl-pasta-sidebar${sidebarRecolhida ? " sidebar-recolhida" : ""}${menuMobileAberto ? " menu-mobile-aberto" : ""}`}>
      {/* Backdrop do drawer: so aparece no celular com o menu aberto. */}
      {menuMobileAberto && (
        <div className="xl-sidebar-backdrop" onClick={() => setMenuMobileAberto(false)} aria-hidden="true" />
      )}
      <aside className="xl-sidebar" aria-label="Navegação da obra">
        <nav className="xl-sidebar-nav">
          {grupos.map(grupo => (
            <div className="xl-sidebar-group" key={grupo.titulo}>
              {!sidebarRecolhida && <div className="xl-sidebar-label">{grupo.titulo}</div>}
              {grupo.ids.map(id => {
                const a = ABAS.find(item => item.id === id);
                if (!a) return null;
                // Central de Comando é admin-only: escondida no menu, não só
                // desabilitada. O gate vive aqui, no dono da navegação.
                if (a.id === "comando" && usuario?.role !== "admin") return null;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`xl-sidebar-item${a.id === aba ? " ativa" : ""}`}
                    onClick={() => irParaAba(a.id)}
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
          <div className="xl-sidebar-group">
            {!sidebarRecolhida && <div className="xl-sidebar-label">AÇÕES</div>}
            <button
              type="button"
              className="xl-sidebar-item"
              onClick={() => window.dispatchEvent(new CustomEvent("abrir-arquimedes"))}
              title={sidebarRecolhida ? "Arquimedes" : "Abrir o Arquimedes"}
            >
              <Bot size={17} />
              {!sidebarRecolhida && <span>Arquimedes</span>}
            </button>
            <button
              type="button"
              className="xl-sidebar-item"
              onClick={onLixeira}
              title={sidebarRecolhida ? "Lixeira" : "Lixeira de obras"}
            >
              <Trash2 size={17} />
              {!sidebarRecolhida && <span>Lixeira{lixeiraCount ? ` (${lixeiraCount})` : ""}</span>}
            </button>
          </div>
        </nav>

        <div className="xl-sidebar-pe">
          <span className="xl-sidebar-user" title={usuario?.name || "Conta"}>
            {(usuario?.name || "R").charAt(0).toUpperCase()}
          </span>
          {!sidebarRecolhida && <span className="xl-sidebar-user-nome">{usuario?.name || "Conta"}</span>}
          <button
            type="button"
            className="xl-sidebar-sair"
            onClick={() => { window.location.href = "/api/auth/logout"; }}
            title="Sair da conta"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      <main className="xl-area xl-area-sidebar">
        {/* O painel já tem cabeçalho próprio: a barra aqui só repetia o nome. */}
        {aba !== "dashboard" && (
          <div className="arquimedes-workbar">
            <div className="arquimedes-workbar-title">
              <span className="arquimedes-kicker">{etapaAtual}</span>
              {obra && <span className="arquimedes-workbar-obra">{obra}</span>}
            </div>
            {etapasDoPlanejamento.some((passo) => passo.aba === aba) && (
              <div className="arquimedes-trilha" aria-label="Fluxo do planejamento">
                <span className="arquimedes-trilha-label">Fluxo:</span>
                {etapasDoPlanejamento.map((passo, index) => (
                  <Fragment key={passo.etapa}>
                    {index > 0 && <span className="arquimedes-trilha-seta">→</span>}
                    <button
                      type="button"
                      className={etapaAtual === passo.etapa ? "ativo" : ""}
                      onClick={() => irParaAba(passo.aba)}
                      title={`Ir para ${passo.etapa}`}
                    >
                      {passo.etapa}
                    </button>
                  </Fragment>
                ))}
              </div>
            )}
            {/* O menu do celular saiu daqui e virou a barra de campo, no fim da
                pagina: era o unico caminho de navegacao e desaparecia justamente
                no painel. A barra de trabalho ficou so com o "proximo passo". */}
          </div>
        )}
        <div className="arquimedes-content">
        {aba === "dashboard" ? (
          <PainelDoCronograma
            agregado={agregado}
            linhas={grade.data?.linhas}
            projetoId={projetoId}
            nomeObra={obra}
            carregandoGrade={grade.isPending}
          />
        ) : aba === "escopo" ? (
          <EscopoInicial projetoId={projetoId} obra={obra} localizacao={localizacao} descricao={descricao} tipoDeObra={tipoDeObra} cubValor={cubValor} cubUf={cubUf} cubMes={cubMes} bdiDeclarado={bdiDeclarado} />
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
        ) : aba === "documentos" ? (
          <DocumentosDaObra projetoId={projetoId} />
        ) : aba === "suprimentos" ? (
          <AbaSuprimentos projetoId={projetoId} />
        ) : aba === "financeiro" ? (
          <AbaOrcamento projetoId={projetoId} />
        ) : aba === "riscos" ? (
          <AbaRiscos projetoId={projetoId} />
        ) : aba === "curva-s" ? (
          <AbaCurvaS projetoId={projetoId} hoje={hoje} />
        ) : aba === "catalogo" ? (
          <AbaCatalogo />
        ) : aba === "comando" ? (
          <CentralComandoArquimedes />
        ) : (
          <AbaVazia titulo={definicao?.rotulo ?? aba} falta={definicao?.falta ?? ""} />
        )}
        </div>
      </main>
      {/* `<nav>` de verdade: leitor de tela anuncia, e o teclado externo tabula.
          Z-index fica abaixo do backdrop do drawer para o menu cobrir a barra. */}
      <nav className="xl-barra-campo" aria-label="Atalhos de campo">
        {atalhosDeCampo.map((atalho) => (
          <button
            key={atalho.id}
            type="button"
            className={`xl-barra-campo-item${aba === atalho.id ? " ativa" : ""}`}
            aria-current={aba === atalho.id ? "page" : undefined}
            onClick={() => irParaAba(atalho.id)}
          >
            {atalho.icone}
            <span>{atalho.rotulo}</span>
          </button>
        ))}
        <button
          type="button"
          className={`xl-barra-campo-item${menuMobileAberto ? " ativa" : ""}`}
          aria-label="Todas as abas da obra"
          aria-expanded={menuMobileAberto}
          onClick={() => setMenuMobileAberto(true)}
        >
          <Menu size={22} aria-hidden="true" />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  );
}

/** Escopo: workspace do que a obra contém, entrega e deixa de entregar. */
function EscopoInicial({ projetoId, obra, localizacao, descricao, tipoDeObra, cubValor, cubUf, cubMes, bdiDeclarado }: { projetoId: number; obra: string; localizacao: string; descricao: string; tipoDeObra: TipoDeObra | ""; cubValor: string; cubUf: string; cubMes: string; bdiDeclarado: string }) {
  const utils = trpc.useUtils();
  const [editando, setEditando] = useState(false);
  const [descricaoEditada, setDescricaoEditada] = useState(descricao);
  const [localizacaoEditada, setLocalizacaoEditada] = useState(localizacao);
  const [tipoDeObraEditado, setTipoDeObraEditado] = useState(tipoDeObra);
  const [cubValorEditado, setCubValorEditado] = useState(cubValor);
  const [cubUfEditada, setCubUfEditada] = useState(cubUf);
  const [cubMesEditado, setCubMesEditado] = useState(cubMes);
  const [bdiEditado, setBdiEditado] = useState(bdiDeclarado);
  useEffect(() => {
    setDescricaoEditada(descricao);
    setLocalizacaoEditada(localizacao);
    setTipoDeObraEditado(tipoDeObra);
    setCubValorEditado(cubValor);
    setCubUfEditada(cubUf);
    setCubMesEditado(cubMes);
    setBdiEditado(bdiDeclarado);
  }, [descricao, localizacao, tipoDeObra, cubValor, cubUf, cubMes, bdiDeclarado]);
  const salvarEscopo = trpc.projects.updateScope.useMutation({
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      setEditando(false);
    },
  });
  // R6-02: o CUB e o BDI sao DECLARADOS pelo engenheiro — vazio significa
  // "obra nao declarou", nao "zero". Aceita virgula como separador decimal.
  const numeroOuNulo = (v: string): number | null | "invalido" => {
    const t = v.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : "invalido";
  };
  const cubValorNum = numeroOuNulo(cubValorEditado);
  const bdiNum = numeroOuNulo(bdiEditado);
  const cubUfValida = cubUfEditada.trim() === "" || cubUfEditada.trim().length === 2;
  const cubMesValido = cubMesEditado.trim() === "" || /^\d{4}-(0[1-9]|1[0-2])$/.test(cubMesEditado.trim());
  const cubBdiValidos = cubValorNum !== "invalido" && bdiNum !== "invalido"
    && (bdiNum === null || (bdiNum >= 0 && bdiNum <= 1));
  const formatarReal = (v: string) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v; };
  const formatarPct = (v: string) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 }) + "%" : v; };
  const cubCamposPreenchidos = [cubValor.trim(), cubUf.trim(), cubMes.trim()].filter(v => v !== "").length;
  const cubCompleto = cubCamposPreenchidos === 3;
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
  const comQuantidade = atividades.filter(l => (Number(l.quantidade) || 0) > 0).length;
  const naturezaDoObjeto = ({ edificio: "Edificação / construção nova", reforma: "Reforma", pavimentacao: "Pavimentação", saneamento: "Saneamento / infraestrutura", todos: "Múltiplas frentes" } as Record<string, string>)[tipoDeObra] ?? null;
  const dimensoesComDados = [
    Boolean(descricao.trim() && naturezaDoObjeto),
    frentes.length > 0,
    pavimentos.length > 0,
    comQuantidade > 0,
  ].filter(Boolean).length;

  // O campo descrição desta obra guarda o pedido feito ao assistente ("não
  // invente informações", "proponha uma EAP"). Isso não é declaração de escopo e
  // não pode passar como se fosse: o painel avisa e o gate não fecha.
  const instrucoesNoTexto = /(n[ãa]o invente|proponha uma eap|ser[áa] revisada pelo engenheiro|com base nessa descri[çc][ãa]o)/i.test(descricao);
  const plural = (quantidade: number, singular: string, varios: string) =>
    `${quantidade} ${quantidade === 1 ? singular : varios}`;

  // Cada linha é uma dimensão do escopo com a situação real, apurada no
  // cronograma e no cadastro — não uma lista de caixas para o engenheiro
  // preencher. O que não está declarado aparece como pendência, com o número.
  const elementos = [
    {
      codigo: "ESC-01",
      nome: "Objeto contratado",
      categoria: "DEFINIÇÃO",
      detalhe: naturezaDoObjeto
        ? `${naturezaDoObjeto}${localizacao ? ` · ${localizacao}` : " · localização não informada"}`
        : "Natureza da obra não declarada no cadastro",
      status: naturezaDoObjeto ? "Declarado" : "Pendente",
    },
    {
      codigo: "ESC-02",
      nome: "Frentes de execução",
      categoria: "ORGANIZAÇÃO",
      detalhe: frentes.length
        ? `${plural(frentes.length, "frente", "frentes")} no cronograma: ${frentes.slice(0, 3).join(", ")}${frentes.length > 3 ? "…" : ""}`
        : "Nenhuma frente identificada no cronograma",
      status: frentes.length ? "Identificado" : "Pendente",
    },
    {
      codigo: "ESC-03",
      nome: "Locais de execução",
      categoria: "ORGANIZAÇÃO",
      detalhe: pavimentos.length
        ? `${plural(pavimentos.length, "local no cronograma", "locais no cronograma")}: ${pavimentos.slice(0, 3).join(", ")}${pavimentos.length > 3 ? "…" : ""}`
        : "Nenhum pavimento ou setor identificado no cronograma",
      status: pavimentos.length ? "Identificado" : "Pendente",
    },
    {
      codigo: "ESC-04",
      nome: "Quantitativos",
      categoria: "MEDIÇÃO",
      detalhe: `${plural(atividades.length, "atividade no cronograma", "atividades no cronograma")}, ${comQuantidade} com quantidade${unidades > 0 ? ` · ${unidades.toLocaleString("pt-BR")} unidades no total` : ""}`,
      status: comQuantidade === atividades.length && atividades.length > 0 ? "Completo" : comQuantidade > 0 ? "Parcial" : "Pendente",
    },
  ];

  return (
    <div className="scopo-workspace">
      <header className="scopo-workspace-header">
        <div className="scopo-workspace-title">
          <span className="scopo-kicker">PLANEJAMENTO · ESCOPO</span>
          <h1>Escopo da obra</h1>
          <p>{obra} · objeto contratado, limites de execução e base da estrutura analítica do projeto.</p>
        </div>
        <div className="scopo-header-actions">
          {editando ? (
            <>
              <button type="button" className="scopo-btn secondary" disabled={salvarEscopo.isPending || localizacaoEditada.trim().length < 2 || !cubBdiValidos || !cubUfValida || !cubMesValido} onClick={() => salvarEscopo.mutate({ projectId: projetoId, location: localizacaoEditada.trim(), tipoDeObra: tipoDeObraEditado || null, descricao: descricaoEditada.trim(), cubValor: cubValorNum === "invalido" ? null : cubValorNum, cubUf: cubUfEditada.trim() === "" ? null : cubUfEditada.trim().toUpperCase(), cubMes: cubMesEditado.trim() === "" ? null : cubMesEditado.trim(), bdiDeclarado: bdiNum === "invalido" ? null : bdiNum })}>{salvarEscopo.isPending ? "Salvando…" : "Salvar escopo"}</button>
              <button type="button" className="scopo-btn secondary" disabled={salvarEscopo.isPending} onClick={() => { setDescricaoEditada(descricao); setLocalizacaoEditada(localizacao); setTipoDeObraEditado(tipoDeObra); setCubValorEditado(cubValor); setCubUfEditada(cubUf); setCubMesEditado(cubMes); setBdiEditado(bdiDeclarado); setEditando(false); salvarEscopo.reset(); }}>Cancelar</button>
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
            <p><strong>Natureza:</strong> {({ edificio: "Edificação / construção nova", reforma: "Reforma", pavimentacao: "Pavimentação", saneamento: "Saneamento / infraestrutura", todos: "Múltiplas frentes" } as Record<string, string>)[tipoDeObra] ?? "Não declarada"}</p>
            <p><strong>Localização:</strong> {localizacao || "Não informada"}</p>
            <p><strong>Descrição do escopo:</strong></p>
            {descricao.trim() ? (
              descricao.length > 700 ? (
                <details className="scopo-descricao">
                  <summary>{descricao.slice(0, 700).trim()}… <em>ver texto completo ({descricao.length} caracteres)</em></summary>
                  <p>{descricao}</p>
                </details>
              ) : (
                <p>{descricao}</p>
              )
            ) : (
              <p>Não declarada. A descrição deve registrar inclusões, exclusões e premissas do contrato.</p>
            )}
            {instrucoesNoTexto && (
              <p className="scopo-alerta" role="alert">
                <strong>Atenção:</strong> o texto registrado contém instruções de geração de EAP (pedido ao assistente), não uma declaração de escopo. Revise antes de aprovar.
              </p>
            )}
            <p><strong>CUB de referência (R$/m²):</strong> {cubCamposPreenchidos === 0
              ? "Não declarado. Sem valor, UF e mês não há conferência de custo por m²."
              : cubCompleto
                ? `R$ ${formatarReal(cubValor)}/m² · ${cubUf.trim().toUpperCase()} · referência ${cubMes.trim()}`
                : `Declaração incompleta (${cubCamposPreenchidos} de 3 campos) — a conferência exige valor, UF e mês de referência.`}</p>
            <p><strong>BDI:</strong> {bdiDeclarado.trim() === ""
              ? "Não declarado. O desvio de preço é tratado como aviso."
              : formatarPct(bdiDeclarado)}</p>
          </div>
        </details>
      </section>
      {editando && (
        <section className="scopo-detail scopo-edit-form">
          <div className="scopo-detail-body">
            <label><strong>Localização da obra</strong><input value={localizacaoEditada} onChange={event => setLocalizacaoEditada(event.target.value)} minLength={2} maxLength={180} placeholder="Cidade, endereço ou região" /></label>
            <label><strong>Natureza da obra</strong>
              <select value={tipoDeObraEditado} onChange={event => setTipoDeObraEditado(event.target.value as TipoDeObra | "")}>
                <option value="">A confirmar</option>
                <option value="edificio">Edificação / construção nova</option>
                <option value="reforma">Reforma</option>
                <option value="pavimentacao">Pavimentação</option>
                <option value="saneamento">Saneamento / infraestrutura</option>
                <option value="todos">Múltiplas frentes</option>
              </select>
            </label>
            <label><strong>Descrição formal do escopo</strong>
              <textarea value={descricaoEditada} onChange={event => setDescricaoEditada(event.target.value)} maxLength={4000} rows={7} placeholder="Inclusões, exclusões, premissas, limites contratuais e pendências." />
              <small>{descricaoEditada.length}/4000 caracteres. Separe o que está confirmado do que é premissa.</small>
            </label>
            <label><strong>CUB de referência — valor (R$/m²)</strong>
              <input value={cubValorEditado} onChange={event => setCubValorEditado(event.target.value)} inputMode="decimal" placeholder="Ex.: 2850,00" />
              <small>Opcional. A conferência de custo por m² só roda com valor, UF e mês.</small>
              {cubValorNum === "invalido" && <small role="alert">Informe um número (ex.: 2850,00).</small>}
            </label>
            <label><strong>CUB de referência — UF</strong>
              <input value={cubUfEditada} onChange={event => setCubUfEditada(event.target.value)} maxLength={2} placeholder="Ex.: SP" />
              {!cubUfValida && <small role="alert">Informe a sigla da UF com 2 letras (ex.: SP).</small>}
            </label>
            <label><strong>CUB de referência — mês (AAAA-MM)</strong>
              <input value={cubMesEditado} onChange={event => setCubMesEditado(event.target.value)} maxLength={7} placeholder="Ex.: 2026-09" />
              {!cubMesValido && <small role="alert">Use o formato AAAA-MM (ex.: 2026-09).</small>}
            </label>
            <label><strong>BDI (fração sobre o custo)</strong>
              <input value={bdiEditado} onChange={event => setBdiEditado(event.target.value)} inputMode="decimal" placeholder="Ex.: 0,25 para 25%" />
              <small>Com BDI declarado, desvio de preço é erro; sem BDI, é aviso.</small>
              {bdiNum !== "invalido" && bdiNum !== null && (bdiNum < 0 || bdiNum > 1) && <small role="alert">Informe a fração entre 0 e 1 (ex.: 0,25 para 25%).</small>}
            </label>
            {salvarEscopo.isError && <p role="alert">{salvarEscopo.error.message}</p>}
          </div>
        </section>
      )}

      <div className="scopo-flow" aria-label="Fluxo do planejamento">
        <strong>Obra</strong><span>→</span><span className="ativo">Escopo</span><span>→</span><span>EAP</span><span>→</span><span>Quantitativos</span><span>→</span><span>Orçamento</span><span>→</span><span>Atividades</span>
      </div>

      <section className="scopo-metrics" aria-label="Indicadores do escopo">
        <div><span>DIMENSÕES</span><strong>{elementos.length}</strong><small>dimensões avaliadas</small></div>
        <div><span>FRENTES</span><strong>{frentes.length}</strong><small>no cronograma</small></div>
        <div><span>LOCAIS</span><strong>{pavimentos.length}</strong><small>no cronograma</small></div>
        <div className={dimensoesComDados < elementos.length ? "attention" : ""}><span>RASTREABILIDADE</span><strong>{dimensoesComDados === elementos.length ? "COMPLETA" : dimensoesComDados > 0 ? "PARCIAL" : "PENDENTE"}</strong><small>{dimensoesComDados} de {elementos.length} dimensões com dados</small></div>
      </section>

      <div className="scopo-toolbar">
        <div className="scopo-toolbar-title"><strong>Dimensões do escopo</strong><span>Situação apurada no cadastro da obra e no cronograma vigente.</span></div>
        <span className="scopo-readonly">BASE: CADASTRO + CRONOGRAMA</span>
      </div>

      <section className="scopo-table-wrap">
        <table className="scopo-table">
          <thead><tr><th className="codigo-col">CÓD.</th><th className="elemento-col">DIMENSÃO</th><th>CATEGORIA</th><th>SITUAÇÃO</th><th>STATUS</th></tr></thead>
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
          <summary>Critérios para aprovação do escopo</summary>
          <div className="scopo-detail-body">
            <p><strong>{naturezaDoObjeto && localizacao ? "✓" : "○"} Objeto e local declarados</strong> — natureza {naturezaDoObjeto ? naturezaDoObjeto.toLowerCase() : "não informada"}; local {localizacao || "não informado"}.</p>
            <p><strong>{descricao.trim() && !instrucoesNoTexto ? "✓" : "○"} Descrição formal registrada</strong> — {!descricao.trim()
              ? "falta registrar inclusões, exclusões e premissas."
              : instrucoesNoTexto
                ? "o texto atual é um pedido ao assistente, não uma declaração de escopo."
                : "contém inclusões, exclusões e premissas."}</p>
            <p><strong>{frentes.length && pavimentos.length ? "✓" : "○"} Organização da execução</strong> — {plural(frentes.length, "frente", "frentes")} e {plural(pavimentos.length, "local", "locais")} no cronograma.</p>
            <p><strong>{atividades.length > 0 && comQuantidade === atividades.length ? "✓" : "○"} Quantitativos completos</strong> — {comQuantidade} de {plural(atividades.length, "atividade", "atividades")} com quantidade informada.</p>
          </div>
        </details>
        <details open className="scopo-detail">
          <summary>Rastreabilidade até o orçamento</summary>
          <div className="scopo-detail-body">
            <div className="scopo-trace"><span>ESCOPO</span><b>→</b><span>EAP</span><b>→</b><span>QUANTITATIVOS</span><b>→</b><span>ATIVIDADES</span></div>
            <p>{temPlanejamento
              ? `${plural(atividades.length, "atividade", "atividades")} no cronograma, ${plural(frentes.length, "frente", "frentes")} e ${plural(pavimentos.length, "local", "locais")}. ${comQuantidade} têm quantidade informada — é a quantidade que liga a atividade ao orçamento e permite medir avanço.`
              : "O cronograma ainda não tem atividades. Sem atividade não há quantidade, e sem quantidade a cadeia escopo → EAP → orçamento não fecha."}</p>
          </div>
        </details>
      </section>

      <footer className="scopo-footer">
        <span><strong>Regra:</strong> o escopo define o que é entregue; a EAP organiza e controla a execução.</span>
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
  tipoDeObra: TipoDeObra;
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
