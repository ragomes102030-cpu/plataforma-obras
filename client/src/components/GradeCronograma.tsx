import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  gradeDoCronograma,
  type EntradaDaLinha,
  type LinhaDoCronograma,
  type StatusDaLinha,
} from "@shared/cronograma-colunas";
import { formatDate, type IsoDate, type WorkCalendar } from "@shared/work-calendar";

/**
 * A folha CRONOGRAMA, com o desenho da planilha.
 *
 * COLUNAS A..M
 *
 * A letra da coluna e o número da linha existem de verdade, e as posições batem
 * com a planilha de referência: cabeçalho na linha 4, dados a partir da linha 5,
 * A e B congeladas (`freeze_panes = "C5"` no arquivo).
 *
 * COLUNAS CINZA
 *
 * F, J, K, L e M são fórmula na planilha e chegam prontas do motor
 * (`shared/cronograma-colunas.ts`). Se aparecer aritmética neste arquivo, é
 * defeito: existiriam duas verdades sobre a mesma célula.
 *
 * SALVAMENTO
 *
 * A célula é um input controlado local e grava sozinha depois de 600ms parado.
 * Sem o atraso, cada tecla viraria uma mutation — a grade tem 84 linhas e a
 * pessoa digita duração ou quantidade numa de cada vez. O input continua
 * controlado pela linha para não perder o que está sendo digitado enquanto a
 * resposta não volta.
 *
 * A data de início vai como DATA, e o backend converte para o índice de dias
 * que o banco guarda. A conversão é do lado dele porque a leitura usa um
 * calendário que a tela não conhece.
 */

type Props = {
  obra: string;
  projetoId: number;
  calendario: WorkCalendar;
  hoje: IsoDate;
  linhas: EntradaDaLinha[];
  /** `linha.codigo` -> id da atividade no banco. */
  idPorCodigo: Map<string, number>;
  /** Leva à aba EAP, de onde as folhas vêm. */
  aoPedirEap?: () => void;
};

export type CampoEditavel =
  | "atividade"
  | "frente"
  | "pavimento"
  | "inicio"
  | "duracao"
  | "quantidade"
  | "unidade";

type Coluna = {
  letra: string;
  titulo: string;
  derivada: boolean;
  largura: number;
  campo?: CampoEditavel;
  tipo?: "date" | "number" | "text";
};

/** A..M, na ordem da planilha. A letra é o identificador da coluna na tela. */
const COLUNAS: Coluna[] = [
  { letra: "A", titulo: "Codigo", derivada: true, largura: 78 },
  { letra: "B", titulo: "Atividade", derivada: false, largura: 300, campo: "atividade", tipo: "text" },
  { letra: "C", titulo: "Frente", derivada: false, largura: 120, campo: "frente", tipo: "text" },
  { letra: "D", titulo: "Pavimento", derivada: false, largura: 104, campo: "pavimento", tipo: "text" },
  { letra: "E", titulo: "Inicio", derivada: false, largura: 108, campo: "inicio", tipo: "date" },
  { letra: "F", titulo: "Fim", derivada: true, largura: 100 },
  { letra: "G", titulo: "Duracao (d)", derivada: false, largura: 96, campo: "duracao", tipo: "number" },
  { letra: "H", titulo: "Quantidade", derivada: false, largura: 108, campo: "quantidade", tipo: "number" },
  { letra: "I", titulo: "Unid", derivada: false, largura: 80, campo: "unidade", tipo: "text" },
  { letra: "J", titulo: "Produtividade", derivada: true, largura: 118 },
  { letra: "K", titulo: "% Planej.", derivada: true, largura: 104 },
  { letra: "L", titulo: "% Real", derivada: true, largura: 104 },
  { letra: "M", titulo: "Status", derivada: true, largura: 132 },
];

/** A nota da linha 2 da planilha: as fórmulas, escritas por extenso. */
const NOTA =
  "Duracao = (Fim - Inicio + 1)  ·  Produtividade = Quantidade / Duracao  ·  % Planej. = (Hoje - Inicio + 1) / Duracao  ·  % Real = Executado / Quantidade";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function num(n: number | null, casas: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

const CLASSE_DO_STATUS: Record<StatusDaLinha, string> = {
  Concluido: "xl-concluido",
  "Em andamento": "xl-andamento",
  Atrasado: "xl-atrasado",
  "Nao iniciado": "xl-nao-iniciado",
};

function rotuloDoStatus(s: StatusDaLinha): string {
  switch (s) {
    case "Concluido":
      return "Concluído";
    case "Em andamento":
      return "Em andamento";
    case "Atrasado":
      return "Atrasado";
    case "Nao iniciado":
      return "Não iniciado";
  }
}

export function GradeCronograma({
  obra,
  projetoId,
  calendario,
  hoje,
  linhas,
  idPorCodigo,
  aoPedirEap,
}: Props) {
  // A ordenação e as cinco colunas derivadas saem do motor, nunca daqui.
  const computadas = useMemo(
    () => gradeDoCronograma(calendario, hoje, linhas),
    [calendario, hoje, linhas]
  );

  const utils = trpc.useUtils();
  const salvar = trpc.planning.atualizarAtividade.useMutation({
    onSuccess: async () => {
      await utils.planning.grade.invalidate({ projectId: projetoId });
    },
  });

  // Estado de edição: chave "id|campo" -> o que está na tela agora. Vive fora
  // das linhas para não brigar com o refetch do motor.
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<Record<string, string>>({});
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Se a mutation falhou, o valor na tela é mentira. Volta para o do banco.
  useEffect(() => {
    if (!salvar.isError) return;
    const mensagem = salvar.error?.message ?? "Não foi possível gravar.";
    setErro(antigo => ({ ...antigo, geral: mensagem }));
    setRascunho({});
  }, [salvar.isError, salvar.error]);

  const agendarSalvar = useCallback(
    (idAtividade: number, campo: CampoEditavel, valor: string) => {
      const chave = `${idAtividade}|${campo}`;
      setRascunho(antigo => ({ ...antigo, [chave]: valor }));
      const anterior = timers.current.get(chave);
      if (anterior) clearTimeout(anterior);
      timers.current.set(
        chave,
        setTimeout(() => {
          timers.current.delete(chave);
          salvar.mutate({ projectId: projetoId, atividadeId: idAtividade, campo, valor });
        }, 600)
      );
    },
    [projetoId, salvar]
  );

  // Um timer pendente quando a pessoa sai da tela = tecla perdida.
  useEffect(() => {
    const mapa = timers.current;
    return () => {
      for (const t of mapa.values()) clearTimeout(t);
      mapa.clear();
    };
  }, []);

  const totalColunas = COLUNAS.length;

  if (computadas.length === 0) {
    return <CronogramaVazio aoPedirEap={aoPedirEap} />;
  }

  return (
    <div className="xl-folha-area">
      {erro.geral && (
        <div className="xl-aviso-erro" role="alert">
          {erro.geral}
          <button type="button" onClick={() => setErro({})}>
            fechar
          </button>
        </div>
      )}

      <table className="xl-folha">
        <colgroup>
          <col style={{ width: 42 }} />
          {COLUNAS.map(c => (
            <col key={c.letra} style={{ width: c.largura }} />
          ))}
        </colgroup>

        <thead>
          <tr>
            <th className="xl-cab-titulo" colSpan={totalColunas + 1}>
              CRONOGRAMA DE OBRA — {obra}
            </th>
          </tr>
          <tr>
            <th className="xl-cab-nota" colSpan={totalColunas + 1}>
              {NOTA}
            </th>
          </tr>
          <tr className="xl-cab-vazio">
            <th colSpan={totalColunas + 1} />
          </tr>
          <tr className="xl-cab-linha">
            <th className="xl-canto" />
            {COLUNAS.map(c => (
              <th key={c.letra} className="xl-cab-letra" scope="col">
                {c.letra}
              </th>
            ))}
          </tr>
          <tr className="xl-cab-nomes">
            <th className="xl-canto" scope="col">
              #
            </th>
            {COLUNAS.map(c => (
              <th
                key={c.letra}
                scope="col"
                className={`xl-cab-nome${c.derivada ? " xl-derivada" : ""}`}
                title={c.derivada ? "Calculado pelo motor — não é digitável" : "Digitável"}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {computadas.map((l, i) => (
            <Linha
              key={l.codigo || `l${i}`}
              n={i + 5}
              linha={l}
              idAtividade={idPorCodigo.get(l.codigo)}
              rascunho={rascunho}
              aoDigitar={agendarSalvar}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Linha({
  n,
  linha,
  idAtividade,
  rascunho,
  aoDigitar,
}: {
  n: number;
  linha: LinhaDoCronograma;
  idAtividade: number | undefined;
  rascunho: Record<string, string>;
  aoDigitar: (id: number, campo: CampoEditavel, valor: string) => void;
}) {
  const c = (i: number) => COLUNAS[i]!;
  const celula = (indice: number) => {
    const coluna = c(indice);
    const chave = `${idAtividade}|${coluna.campo}`;
    const emEdicao = rascunho[chave];
    return { coluna, valor: emEdicao ?? String(valorPadrao(indice, linha)) };
  };

  return (
    <tr className={CLASSE_DO_STATUS[linha.status]}>
      <th className="xl-num" scope="row">
        {n}
      </th>
      <td className="xl-codigo xl-calc" title="Código da folha na EAP">
        {linha.codigo}
      </td>
      <Celula {...celula(1)} idAtividade={idAtividade} aoDigitar={aoDigitar} />
      <Celula {...celula(2)} idAtividade={idAtividade} aoDigitar={aoDigitar} />
      <Celula {...celula(3)} idAtividade={idAtividade} aoDigitar={aoDigitar} />
      <Celula {...celula(4)} idAtividade={idAtividade} aoDigitar={aoDigitar} />
      <td className="xl-calc" title="Início + Duração − 1">
        {formatDate(linha.fim)}
      </td>
      <Celula {...celula(6)} idAtividade={idAtividade} aoDigitar={aoDigitar} />
      <Celula {...celula(7)} idAtividade={idAtividade} aoDigitar={aoDigitar} />
      <Celula {...celula(8)} idAtividade={idAtividade} aoDigitar={aoDigitar} />
      <td className="xl-calc" title="Quantidade ÷ Duração">
        {linha.produtividade == null ? "—" : `${num(linha.produtividade, 2)} /dia`}
      </td>
      <td className="xl-calc xl-pct" title="Quanto da duração já passou até a data-base">
        <span className="xl-medidor">
          <span style={{ width: pct(linha.pctPlanejado) }} />
        </span>
        {pct(linha.pctPlanejado)}
      </td>
      <td className="xl-calc xl-pct" title="Executado ÷ quantidade planejada">
        <span className="xl-medidor">
          <span style={{ width: pct(linha.pctReal) }} />
        </span>
        {pct(linha.pctReal)}
      </td>
      <td className="xl-calc xl-status">
        <span className="xl-etiqueta">{rotuloDoStatus(linha.status)}</span>
      </td>
    </tr>
  );
}

function valorPadrao(indice: number, l: LinhaDoCronograma): string | number {
  switch (indice) {
    case 1:
      return l.atividade;
    case 2:
      return l.frente;
    case 3:
      return l.pavimento ?? "";
    case 4:
      return l.inicio;
    case 6:
      return String(l.duracao);
    case 7:
      return l.quantidade == null ? "" : String(l.quantidade);
    case 8:
      return l.unidade ?? "";
    default:
      return "";
  }
}

function Celula({
  coluna,
  valor,
  idAtividade,
  aoDigitar,
}: {
  coluna: Coluna;
  valor: string;
  idAtividade: number | undefined;
  aoDigitar: (id: number, campo: CampoEditavel, valor: string) => void;
}) {
  // Coluna derivada: não é input. E uma coluna sem `campo` não tem o que
  // gravar.
  if (coluna.derivada || !coluna.campo) {
    return (
      <td className="xl-calc" title={coluna.titulo}>
        {valor}
      </td>
    );
  }

  // Atividade sem id não existe no banco ainda: o input ficaria accepting
  // digits that go nowhere, que é pior que não ser digitável.
  if (idAtividade == null) {
    return (
      <td className="xl-calc" title="Esta linha ainda não está no cronograma">
        {valor}
      </td>
    );
  }

  return (
    <td className="xl-digitavel" data-col={coluna.letra}>
      <input
        className="xl-input"
        value={valor}
        type={coluna.tipo === "text" ? "text" : (coluna.tipo ?? "text")}
        title={`${coluna.letra} · ${coluna.titulo}`}
        onChange={e => aoDigitar(idAtividade, coluna.campo!, e.target.value)}
      />
    </td>
  );
}

/**
 * Cronograma vazio.
 *
 * Diz o que fazer e não desenha grade vazia. A EAP é o que vem do catálogo; o
 * cronograma é ato de planejamento, e começa com as folhas do usuário puxando
 * para dentro dele.
 */
function CronogramaVazio({ aoPedirEap }: { aoPedirEap?: () => void }) {
  return (
    <div className="xl-vazia-folha">
      <h3>O cronograma está vazio</h3>
      <p className="xl-vazia-falta">
        Isso é o estado certo, e não um defeito. A estrutura da obra vem do
        catálogo de preços e já está na aba EAP. O prazo não vem: duração é
        informada por quem planeja, e é por isso que esta aba nasce sem
        nenhuma linha. Puxe as folhas da EAP para cá e informe início e
        duração de cada uma.
      </p>
      <p className="xl-vazia-nota">
        Nasce aqui também a diferença que importa: catálogo gera escopo, escopo
        não gera prazo.
      </p>
      {aoPedirEap && (
        <button type="button" className="eap-btn" onClick={aoPedirEap}>
          Ir para a EAP
        </button>
      )}
    </div>
  );
}
