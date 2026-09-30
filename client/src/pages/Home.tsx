import { Layers3, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { localIsoDe } from "@/lib/datas";
import { AdminLlmSettings } from "@/components/AdminLlmSettings";
import { startLogin } from "@/const";
import { AbaCatalogo } from "@/components/AbaCatalogo";
import { AbaEap } from "@/components/AbaEap";
import { AbaProducao } from "@/components/AbaProducao";
import { GradeCronograma } from "@/components/GradeCronograma";
import { PainelDoCronograma } from "@/components/PainelDoCronograma";
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
  const [aba, setAba] = useState<IdDaAba>("eap");
  const [obraId, setObraId] = useState<number | null>(null);

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
  const obra = obraId == null ? lista[0] : lista.find(o => o.id === obraId);
  const projetoId = obra?.id ?? null;

  return (
    <div className="xl-app">
      <header className="xl-titlebar">
        <div className="xl-titlebar-marca">
          <Layers3 size={15} />
          <strong>{obra?.name ?? "plataformaobras"}</strong>
          {obra && <span className="xl-titlebar-sub">{obra.code}</span>}
        </div>

        <div className="xl-titlebar-obras">
          {lista.map(o => (
            <button
              key={o.id}
              type="button"
              className={`xl-obra-chip${o.id === obra?.id && destino === "obra" ? " ativa" : ""}`}
              onClick={() => {
                setObraId(o.id);
                setDestino("obra");
              }}
              title={o.name}
            >
              {o.name}
            </button>
          ))}
          <button
            type="button"
            className="xl-obra-chip xl-obra-nova"
            title="Nova obra"
            onClick={() => {
              // A criação de obra entra na próxima onda. Por enquanto o botão
              // diz isso em vez de fingir que abriu um modal.
              setDestino("obra");
            }}
          >
            <Plus size={12} />
          </button>
        </div>

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
          {user?.role === "admin" && (
            <button
              type="button"
              className={`xl-tb-btn${destino === "config" ? " ativo" : ""}`}
              onClick={() => setDestino("config")}
            >
              <Sparkles size={13} /> Configurações
            </button>
          )}
          <span className="xl-tb-user" title={user?.name || "Conta"}>
            {(user?.name || "R").charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      {destino === "config" ? (
        <AdminLlmSettings />
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
        <Obra projetoId={projetoId} obra={obra!.name} aba={aba} onAba={setAba} />
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
        {aba === "eap" ? (
          <AbaEap projetoId={projetoId} />
        ) : aba === "cronograma" ? (
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
        ) : aba === "producao" ? (
          <AbaProducao projetoId={projetoId} />
        ) : aba === "dashboard" ? (
          <PainelDoCronograma
            agregado={agregado}
            projetoId={projetoId}
            temExemplo={Object.keys(grade.data?.exemploPorCodigo ?? {}).length > 0}
          />
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

function SemObra({ carregando, temObras }: { carregando: boolean; temObras: boolean }) {
  return (
    <div className="xl-area">
      <div className="xl-vazia-folha">
        <h3>{carregando ? "Carregando as obras…" : "Nenhuma obra aqui"}</h3>
        {!carregando && !temObras && (
          <p className="xl-vazia-falta">
            Não há obra cadastrada. A criação de obra entra na próxima etapa.
          </p>
        )}
      </div>
    </div>
  );
}
