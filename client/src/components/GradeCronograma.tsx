import { useMemo } from "react";
import {
  gradeDoCronograma,
  type EntradaDaLinha,
  type LinhaDoCronograma,
  type StatusDaLinha,
} from "@shared/cronograma-colunas";
import { formatDate, type IsoDate, type WorkCalendar } from "@shared/work-calendar";

/**
 * A grade do CRONOGRAMA: a planilha, com as mesmas colunas e as mesmas regras.
 *
 * POR QUE A GRADE NÃO CALCULA NADA
 *
 * `Fim`, `Produtividade`, `% Planej.`, `% Real` e `Status` chegam prontos do
 * motor (`shared/cronograma-colunas.ts`). A grade só desenha e só devolve o
 * que o usuário digitou. Se aparecer aritmética aqui, é defeito: significa
 * que a regra do backend foi contornada e existem duas verdades sobre a mesma
 * célula.
 *
 * POR QUE AS DERIVADAS FICAM CINZA
 *
 * Na planilha elas são fórmula, e a diferença é visível: a célula que você
 * escreve é branca e a que o sistema calcula é cinza. Sem isso o usuário
 * digita em cima de um valor que o sistema sobrescreve, e não entende por quê.
 */

type Props = {
  calendario: WorkCalendar;
  hoje: IsoDate;
  linhas: EntradaDaLinha[];
  /** Chamado ao terminar de editar uma célula de entrada. */
  onEditar?: (codigo: string, campo: CampoEditavel, valor: string) => void;
};

export type CampoEditavel = "atividade" | "frente" | "pavimento" | "inicio" | "duracao" | "quantidade" | "unidade";

const COLUNAS: {
  chave: string;
  titulo: string;
  derivada: boolean;
  largura: number;
}[] = [
  { chave: "codigo", titulo: "Código", derivada: false, largura: 90 },
  { chave: "atividade", titulo: "Atividade", derivada: false, largura: 300 },
  { chave: "frente", titulo: "Frente", derivada: false, largura: 120 },
  { chave: "pavimento", titulo: "Pavimento", derivada: false, largura: 100 },
  { chave: "inicio", titulo: "Início", derivada: false, largura: 100 },
  { chave: "fim", titulo: "Fim", derivada: true, largura: 100 },
  { chave: "duracao", titulo: "Duração (d)", derivada: false, largura: 100 },
  { chave: "quantidade", titulo: "Quantidade", derivada: false, largura: 110 },
  { chave: "unidade", titulo: "Unid", derivada: false, largura: 80 },
  { chave: "produtividade", titulo: "Produtividade", derivada: true, largura: 120 },
  { chave: "pctPlanejado", titulo: "% Planej.", derivada: true, largura: 100 },
  { chave: "pctReal", titulo: "% Real", derivada: true, largura: 100 },
  { chave: "status", titulo: "Status", derivada: true, largura: 140 },
];

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
  Concluido: "pl-concluido",
  "Em andamento": "pl-em-andamento",
  Atrasado: "pl-atrasado",
  "Nao iniciado": "pl-nao-iniciado",
};

export function GradeCronograma({ calendario, hoje, linhas, onEditar }: Props) {
  // A ordenação e as cinco colunas derivadas saem do motor, nunca daqui.
  const computadas = useMemo(
    () => gradeDoCronograma(calendario, hoje, linhas),
    [calendario, hoje, linhas]
  );

  return (
    <div className="pl-grade-area">
      <div className="pl-grade" role="table" aria-label="Cronograma da obra">
        <div className="pl-linha pl-cabecalho" role="row">
          {COLUNAS.map(c => (
            <div
              key={c.chave}
              role="columnheader"
              className={`pl-celula pl-cabecalho-celula${c.derivada ? " pl-derivada-cabecalho" : ""}`}
              style={{ width: c.largura }}
              title={c.derivada ? "Calculado pelo motor — não é digitável" : "Digitável"}
            >
              {c.titulo}
            </div>
          ))}
        </div>

        {computadas.map((l, i) => (
          <LinhaDaGrade
            key={l.codigo || `linha-${i}`}
            linha={l}
            onEditar={onEditar}
          />
        ))}

        {computadas.length === 0 && (
          <div className="pl-grade-vazia">
            <p>Nenhuma atividade no cronograma.</p>
            <p>
              A obra precisa de atividades. Elas nascem da EAP, quando o catálogo
              é importado — ou entram aqui uma a uma.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function LinhaDaGrade({
  linha,
  onEditar,
}: {
  linha: LinhaDoCronograma;
  onEditar?: Props["onEditar"];
}) {
  return (
    <div className={`pl-linha ${CLASSE_DO_STATUS[linha.status]}`} role="row">
      <div className="pl-celula pl-codigo" role="cell" title={linha.codigo}>
        {linha.codigo}
      </div>

      <CelulaTexto
        valor={linha.atividade}
        campo="atividade"
        codigo={linha.codigo}
        onEditar={onEditar}
        titulo="Atividade"
      />
      <CelulaTexto
        valor={linha.frente}
        campo="frente"
        codigo={linha.codigo}
        onEditar={onEditar}
        titulo="Frente"
      />
      <CelulaTexto
        valor={linha.pavimento ?? ""}
        campo="pavimento"
        codigo={linha.codigo}
        onEditar={onEditar}
        titulo="Pavimento"
      />
      <CelulaTexto
        valor={linha.inicio}
        campo="inicio"
        codigo={linha.codigo}
        onEditar={onEditar}
        titulo="Início"
        tipo="date"
      />

      <div className="pl-celula pl-derivada" role="cell" title="Início + Duração − 1">
        {formatDate(linha.fim)}
      </div>

      <CelulaTexto
        valor={String(linha.duracao)}
        campo="duracao"
        codigo={linha.codigo}
        onEditar={onEditar}
        titulo="Duração em dias"
        tipo="number"
      />
      <CelulaTexto
        valor={linha.quantidade == null ? "" : String(linha.quantidade)}
        campo="quantidade"
        codigo={linha.codigo}
        onEditar={onEditar}
        titulo="Quantidade planejada"
        tipo="number"
      />
      <CelulaTexto
        valor={linha.unidade ?? ""}
        campo="unidade"
        codigo={linha.codigo}
        onEditar={onEditar}
        titulo="Unidade"
      />

      <div className="pl-celula pl-derivada" role="cell" title="Quantidade ÷ Duração">
        {linha.produtividade == null ? "—" : `${num(linha.produtividade, 2)} /dia`}
      </div>
      <div
        className="pl-celula pl-derivada pl-pct"
        role="cell"
        title="Quanto da duração já passou até a data-base"
      >
        <span className="pl-barra">
          <span className="pl-barra-cheia" style={{ width: pct(linha.pctPlanejado) }} />
        </span>
        {pct(linha.pctPlanejado)}
      </div>
      <div
        className="pl-celula pl-derivada pl-pct"
        role="cell"
        title="Executado ÷ quantidade planejada"
      >
        <span className="pl-barra">
          <span className="pl-barra-cheia" style={{ width: pct(linha.pctReal) }} />
        </span>
        {pct(linha.pctReal)}
      </div>
      <div className="pl-celula pl-derivada pl-status" role="cell">
        <span className="pl-etiqueta">{rotuloDoStatus(linha.status)}</span>
      </div>
    </div>
  );
}

function CelulaTexto({
  valor,
  campo,
  codigo,
  onEditar,
  titulo,
  tipo,
}: {
  valor: string;
  campo: CampoEditavel;
  codigo: string;
  onEditar?: Props["onEditar"];
  titulo: string;
  tipo?: "date" | "number" | "text";
}) {
  return (
    <div className="pl-celula pl-digitavel" role="cell">
      <input
        className="pl-input"
        value={valor}
        title={titulo}
        type={tipo === "text" ? "text" : (tipo ?? "text")}
        onChange={e => onEditar?.(codigo, campo, e.target.value)}
      />
    </div>
  );
}

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
