import { Layers3, Plus, Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { localIsoDe } from "@/lib/datas";
import { CentralComandoArquimedes } from "@/components/CentralComandoArquimedes";
import { JanelaAgente } from "@/components/JanelaAgente";
import { startLogin } from "@/const";
import { AbaCatalogo } from "@/components/AbaCatalogo";
import { AbaEap } from "@/components/AbaEap";
import { AbaProducao } from "@/components/AbaProducao";
import { GradeCronograma } from "@/components/GradeCronograma";
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
  const lista: Array<{ id: number; name: string; code: string }> =
    (obras.data as Array<{ id: number; name: string; code: string }> | undefined) ?? [];
  const obrasVisiveis = lista.filter(o => !obrasOcultas.includes(o.id));
  const obra = obraId == null ? lista[0] : lista.find(o => o.id === obraId);
  const projetoId = obra?.id ?? null;
  const criarDemo = trpc.projects.createDemoGantt.useMutation({
    onSuccess: async created => {
      await obras.refetch();
      setObraId(created.projectId);
      setDestino("obra");
      setAba("gantt");
    },
  });

  const criarObra = trpc.projects.create.useMutation({
    onSuccess: async created => {
      await obras.refetch();
      setObraId(created.id);
      setDestino("obra");
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
    window.addEventListener("abrir-configuracao-llm", openConfig);
    return () => window.removeEventListener("abrir-configuracao-llm", openConfig);
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
            <Sparkles size={13} /> Arquimedes
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
          <Obra projetoId={projetoId} obra={obra!.name} aba={aba} onAba={setAba} />
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

/** A obra: abas embaixo, e no meio a aba que está ativa. */
function Obra({
  projetoId,
  obra,
  aba,
  onAba,
}: {
  projetoId: number;
  obra: string;
  aba: IdDaAba;
  onAba: (aba: IdDaAba) => void;
}) {
  const grade = trpc.planning.grade.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );

  // O motor já devolveu as colunas derivadas no calendário que ele usou, e a
  // data de hoje veio junto. A grade é desenhada com esse mesmo resultado.
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
  // O id de cada linha, para a grade gravar a célula certa. Vem do backend
  // ao lado das linhas porque o motor é função pura e não conhece id.
  const idPorCodigo = new Map<string, number>(Object.entries(grade.data?.idsPorCodigo ?? {}));
  const exemploPorCodigo = new Set(
    Object.keys(grade.data?.exemploPorCodigo ?? {})
  );
  const definicao = ABAS.find(a => a.id === aba);

  return (
    <div className="xl-pasta">
      <div className="xl-area">
        {aba === "dashboard" ? (
          <PainelDoCronograma
            agregado={agregado}
            projetoId={projetoId}
            temExemplo={Object.keys(grade.data?.exemploPorCodigo ?? {}).length > 0}
          />
        ) : aba === "eap" ? (
          <AbaEap projetoId={projetoId} />
        ) : aba === "atividades" ? (
          <GradeCronograma
            obra={obra}
            projetoId={projetoId}
            calendario={calendario}
            hoje={hoje}
            linhas={linhas}
            idPorCodigo={idPorCodigo}
            exemploPorCodigo={exemploPorCodigo}
            aoPedirEap={() => onAba("eap")}
          />
        ) : aba === "gantt" ? (
          <VisualizacaoPlanejamento linhas={linhas} inicioObra={grade.data?.inicioObra ?? null} hoje={hoje} view="gantt" />
        ) : aba === "linha-balanco" ? (
          <VisualizacaoPlanejamento linhas={linhas} inicioObra={grade.data?.inicioObra ?? null} hoje={hoje} view="lob" />
        ) : aba === "producao" ? (
          <AbaProducao projetoId={projetoId} />
        ) : (
          <AbaVazia
            titulo={definicao?.rotulo ?? aba}
            falta={definicao?.falta ?? ""}
          />
        )}
      </div>

      <div className="xl-rodape">
        <div className="xl-abas" role="tablist" aria-label="Abas da obra">
          {ABAS.map(a => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === aba}
              data-ativa={a.id === aba}
              data-status={a.status}
              className={`xl-aba${a.id === aba ? " ativa" : ""}`}
              onClick={() => onAba(a.id)}
              title={a.falta ?? a.rotulo}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <span className="xl-rodape-info" aria-hidden="true">
          {obra} · {definicao?.rotulo ?? ""}
        </span>
      </div>
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
    if (!name.trim() || !location.trim()) return;
    onSubmit({
      name: name.trim(),
      location: location.trim(),
      plannedStart: plannedStart ? new Date(`${plannedStart}T12:00:00`) : undefined,
      plannedFinish: plannedFinish ? new Date(`${plannedFinish}T12:00:00`) : undefined,
      tipoDeObra,
      descricao: descricao.trim() || undefined,
    });
  }

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "rgba(15, 23, 42, 0.42)",
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-obra-titulo"
        onSubmit={submit}
        onMouseDown={event => event.stopPropagation()}
        style={{
          width: "min(620px, 100%)",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <h2 id="nova-obra-titulo" style={{ margin: 0, fontSize: 22 }}>Nova obra</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
              Cadastre a obra para começar o planejamento.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar"
            style={{ border: 0, background: "transparent", fontSize: 24, cursor: busy ? "not-allowed" : "pointer", color: "#64748b" }}>
            ×
          </button>
        </div>

        <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Nome da obra *</span>
            <input required minLength={2} maxLength={180} value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Ex.: Residencial Solar" autoFocus style={inputStyle} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Localização *</span>
            <input required minLength={2} maxLength={180} value={location}
              onChange={event => setLocation(event.target.value)}
              placeholder="Cidade, endereço ou região" style={inputStyle} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Início previsto</span>
              <input type="date" value={plannedStart}
                onChange={event => setPlannedStart(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Término previsto</span>
              <input type="date" value={plannedFinish}
                onChange={event => setPlannedFinish(event.target.value)} style={inputStyle} />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Tipo de obra</span>
            <select value={tipoDeObra}
              onChange={event => setTipoDeObra(event.target.value as NovaObraValues["tipoDeObra"])}
              style={inputStyle}>
              <option value="edificio">Edificação</option>
              <option value="reforma">Reforma</option>
              <option value="pavimentacao">Pavimentação</option>
              <option value="saneamento">Saneamento</option>
              <option value="todos">Todos os serviços</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Descrição</span>
            <textarea maxLength={4000} rows={4} value={descricao}
              onChange={event => setDescricao(event.target.value)}
              placeholder="Informações úteis para o planejamento e para o agente."
              style={{ ...inputStyle, resize: "vertical" }} />
          </label>

          {plannedStart && plannedFinish && plannedFinish <= plannedStart && (
            <p style={{ margin: 0, color: "#b42318", fontSize: 14 }}>
              O término deve ser posterior ao início.
            </p>
          )}

          {error && (
            <div role="alert" style={{ padding: 12, borderRadius: 8, background: "#fef3f2", color: "#b42318", fontSize: 14 }}>
              Não foi possível criar a obra: {error}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button type="button" onClick={onClose} disabled={busy} style={secondaryButtonStyle}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim() || !location.trim() || (!!plannedStart && !!plannedFinish && plannedFinish <= plannedStart)}
            style={{ ...primaryButtonStyle, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Criando obra…" : "Criar obra"}
          </button>
        </div>
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
