import { useMemo } from "react";
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
 * A letra da coluna e o numero da linha existem de verdade, e as posicoes
 * batem com a planilha de referencia: cabecalho na linha 4, dados a partir da
 * linha 5, A e B congeladas (`freeze_panes = "C5"` no arquivo). Quem conhece
 * planilha sabe usar esta tela, e a referencia "L14" funciona dos dois lados.
 *
 * COLUNAS CINZA
 *
 * F, J, K, L e M são fórmula na planilha. Aqui chegam prontas do motor
 * (`shared/cronograma-colunas.ts`) e nao sao digitaveis. Se aparecer aritmetica
 * neste arquivo, e defeito: significa que a regra do backend foi contornada e
 * existem duas verdades sobre a mesma celula.
 */

type Props = {
  obra: string;
  calendario: WorkCalendar;
  hoje: IsoDate;
  linhas: EntradaDaLinha[];
  onEditar?: (codigo: string, campo: CampoEditavel, valor: string) => void;
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
  { letra: "A", titulo: "Codigo", derivada: false, largura: 78, campo: undefined },
  { letra: "B", titulo: "Atividade", derivada: false, largura: 300, campo: "atividade", tipo: "text" },
  { letra: "C", titulo: "Frente", derivada: false, largura: 120, campo: "frente", tipo: "text" },
  { letra: "D", titulo: "Pavimento", derivada: false, largura: 104, campo: "pavimento", tipo: "text" },
  { letra: "E", titulo: "Inicio", derivada: false, largura: 100, campo: "inicio", tipo: "date" },
  { letra: "F", titulo: "Fim", derivada: true, largura: 100 },
  { letra: "G", titulo: "Duracao (d)", derivada: false, largura: 96, campo: "duracao", tipo: "number" },
  { letra: "H", titulo: "Quantidade", derivada: false, largura: 108, campo: "quantidade", tipo: "number" },
  { letra: "I", titulo: "Unid", derivada: false, largura: 76, campo: "unidade", tipo: "text" },
  { letra: "J", titulo: "Produtividade", derivada: true, largura: 118 },
  { letra: "K", titulo: "% Planej.", derivada: true, largura: 104 },
  { letra: "L", titulo: "% Real", derivada: true, largura: 104 },
  { letra: "M", titulo: "Status", derivada: true, largura: 132 },
];

/** A nota da linha 2 da planilha: as fórmulas, escritas por extenso. */
const NOTA = "Duracao = (Fim - Inicio + 1)  ·  Produtividade = Quantidade / Duracao  ·  % Planej. = (Hoje - Inicio + 1) / Duracao  ·  % Real = Executado / Quantidade";

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

export function GradeCronograma({ obra, calendario, hoje, linhas, onEditar }: Props) {
  // A ordenacao e as cinco colunas derivadas saem do motor, nunca daqui.
  const computadas = useMemo(
    () => gradeDoCronograma(calendario, hoje, linhas),
    [calendario, hoje, linhas]
  );

  const totalColunas = COLUNAS.length;

  return (
    <div className="xl-folha-area">
      <table className="xl-folha">
        <colgroup>
          <col style={{ width: 42 }} />
          {COLUNAS.map(c => (
            <col key={c.letra} style={{ width: c.largura }} />
          ))}
        </colgroup>

        <thead>
          {/* Linha 1 e 2: título e nota, como na planilha. */}
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
          {/* Linha 4: letra da coluna acima do nome. */}
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
          {computadas.length === 0 ? (
            <tr>
              <td className="xl-vazia" colSpan={totalColunas + 1}>
                <strong>Nenhuma atividade no cronograma.</strong>
                <span>
                  A obra precisa de atividades. Elas nascem da EAP, quando o
                  catálogo é importado — ou entram aqui uma a uma.
                </span>
              </td>
            </tr>
          ) : (
            computadas.map((l, i) => (
              <Linha key={l.codigo || `l${i}`} n={i + 5} linha={l} onEditar={onEditar} />
            ))
          )}
        </tbody>

        {computadas.length > 0 && (
          <tfoot>
            <tr className="xl-total">
              <td />
              <td className="xl-total-rotulo">TOTAL</td>
              <td colSpan={4} />
              <td className="xl-total-num">
                {num(
                  computadas.reduce((s, l) => s + (l.quantidade ?? 0), 0),
                  0
                )}
              </td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Linha({
  n,
  linha,
  onEditar,
}: {
  n: number;
  linha: LinhaDoCronograma;
  onEditar?: Props["onEditar"];
}) {
  const celula = (indice: number) => COLUNAS[indice]!;
  return (
    <tr className={CLASSE_DO_STATUS[linha.status]}>
      <th className="xl-num" scope="row">
        {n}
      </th>
      <td className="xl-codigo" title={linha.codigo}>
        {linha.codigo}
      </td>
      <Celula valor={linha.atividade} c={celula(1)} linha={linha} onEditar={onEditar} />
      <Celula valor={linha.frente} c={celula(2)} linha={linha} onEditar={onEditar} />
      <Celula valor={linha.pavimento ?? ""} c={celula(3)} linha={linha} onEditar={onEditar} />
      <Celula valor={linha.inicio} c={celula(4)} linha={linha} onEditar={onEditar} />
      <td className="xl-calc" title="Início + Duração − 1">
        {formatDate(linha.fim)}
      </td>
      <Celula valor={String(linha.duracao)} c={celula(6)} linha={linha} onEditar={onEditar} />
      <Celula
        valor={linha.quantidade == null ? "" : String(linha.quantidade)}
        c={celula(7)}
        linha={linha}
        onEditar={onEditar}
      />
      <Celula valor={linha.unidade ?? ""} c={celula(8)} linha={linha} onEditar={onEditar} />
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

function Celula({
  valor,
  c,
  linha,
  onEditar,
}: {
  valor: string;
  c: Coluna;
  linha: LinhaDoCronograma;
  onEditar?: Props["onEditar"];
}) {
  if (!c.campo) {
    return (
      <td className="xl-calc" title={c.titulo}>
        {valor}
      </td>
    );
  }
  return (
    <td className="xl-digitavel" data-col={c.letra}>
      <input
        className="xl-input"
        value={valor}
        type={c.tipo === "text" ? "text" : (c.tipo ?? "text")}
        title={`${c.letra} · ${c.titulo}`}
        onChange={e => onEditar?.(linha.codigo, c.campo!, e.target.value)}
      />
    </td>
  );
}
