import { trpc } from "@/lib/trpc";
import type { AgregadoDoCronograma } from "@shared/cronograma-colunas";

/**
 * O DASHBOARD: o painel de cima da planilha.
 *
 * A planilha escreve `=AVERAGE(CRONOGRAMA!L5:L18)` e escreve "média ponderada"
 * no rótulo. Não pondera nada. Aqui a média é ponderada pela quantidade
 * planejada, e o painel diz isso no rótulo — uma tarefa de 15 dias não pode
 * pesar igual a uma de 150.
 *
 * Os números chegam prontos do motor (`agregadoDoCronograma`). Este componente
 * não divide, não soma e não faz média de nada: ele formata.
 */

type Props = {
  agregado: AgregadoDoCronograma | undefined;
  projetoId: number;
  /** Há quantitativo de exemplo na obra? Decide mostrar "Limpar" ou "Carregar". */
  temExemplo?: boolean;
};

function pct(n: number): string {
  return `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function PainelDoCronograma({ agregado, projetoId, temExemplo }: Props) {
  const semQuantidade = (agregado?.linhasSemQuantidade ?? 0) > 0;
  const wbs = trpc.projects.wbs.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const plano = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const pacotesEap = (wbs.data ?? []).filter((node: any) => node.nodeType === "pacote").length;
  const atividades = plano.data?.activities?.length ?? agregado?.totalAtividades ?? 0;
  const dependencias = plano.data?.dependencies?.length ?? 0;
  const baselines = plano.data?.baselines?.length ?? 0;

  if (!agregado || agregado.totalAtividades === 0) {
    return (
      <div className="xl-painel">
        <div className="xl-painel-intro">
          <div>
            <span className="xl-painel-kicker">VISÃO GERAL DA OBRA</span>
            <h2>Planejamento ainda não entrou no cronograma</h2>
            <p>A EAP já estrutura o escopo. O próximo trabalho é transformar os pacotes de trabalho em atividades planejáveis.</p>
          </div>
          <span className="xl-painel-status">Em planejamento</span>
        </div>

        <div className="xl-dashboard-cards">
          <Cartao titulo="Pacotes EAP" valor={String(pacotesEap)} nota="escopo estruturado" />
          <Cartao titulo="Atividades" valor={String(atividades)} nota="ainda não criadas" />
          <Cartao titulo="Dependências" valor={String(dependencias)} nota="rede lógica" />
          <Cartao titulo="Baseline" valor={String(baselines)} nota="cronograma congelado" />
        </div>

        <div className="xl-dashboard-proximo">
          <div>
            <strong>Próximo passo</strong>
            <span>Levar os pacotes da EAP para Atividades e informar duração, início e produtividade.</span>
          </div>
          <div className="xl-dashboard-acoes">
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("abrir-aba-eap"))}>Revisar EAP</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("abrir-aba-atividades"))}>Ir para Atividades</button>
          </div>
        </div>

        <div className="xl-dashboard-fluxo" aria-label="Fluxo do planejamento">
          {["Escopo","EAP","Atividades","Dependências","CPM","Baseline","Gantt / LOB","Controle"].map((etapa, index) => (
            <div key={etapa} className={index < 2 ? "feito" : index === 2 ? "atual" : "bloqueado"}>
              <span>{index + 1}</span><strong>{etapa}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { contagemPorStatus: c } = agregado;
  const atrasadas = c.Atrasado;

  return (
    <div className="xl-painel">
      {semQuantidade && (
        <div className="pl-exemplo-barra">
          <div className="pl-exemplo-texto">
            <strong>Esta obra não tem quantitativo</strong>
            <span>O painel pondera o avanço pela quantidade planejada. Meça os quantitativos na aba CRONOGRAMA para que o avanço físico seja representativo.</span>
          </div>
        </div>
      )}

      <div className="xl-cartoes">
        <Cartao titulo="Avanço físico" valor={pct(agregado.avancoFisico)}>
          ponderado por quantidade, em {agregado.linhasPonderadas} de{" "}
          {agregado.totalAtividades} atividades
        </Cartao>
        <Cartao titulo="Avanço planejado" valor={pct(agregado.avancoPlanejado)}>
          quanto da duração já passou até a data-base
        </Cartao>
        <Cartao
          titulo="Desvio"
          valor={pct(Math.abs(agregado.desvio))}
          tom={agregado.desvio < 0 ? "ruim" : "bom"}
        >
          {agregado.desvio < 0 ? "atrasado" : "adiantado"} — real menos
          planejado
        </Cartao>
        <Cartao
          titulo="Prazo"
          valor={agregado.prazoDias != null ? `${agregado.prazoDias} d` : "—"}
        >
          do primeiro início ao último fim
        </Cartao>
      </div>

      <div className="xl-status-blocos">
        <Status titulo="Concluído" n={c.Concluido} total={agregado.totalAtividades} classe="xl-concluido" />
        <Status titulo="Em andamento" n={c["Em andamento"]} total={agregado.totalAtividades} classe="xl-andamento" />
        <Status titulo="Atrasado" n={c.Atrasado} total={agregado.totalAtividades} classe="xl-atrasado" />
        <Status titulo="Não iniciado" n={c["Nao iniciado"]} total={agregado.totalAtividades} classe="xl-nao-iniciado" />
      </div>

      {atrasadas > 0 && (
        <p className="xl-painel-alerta">
          {atrasadas} {atrasadas === 1 ? "atividade está" : "atividades estão"} sem
          execução e com o fim já passado. A coluna Status da aba CRONOGRAMA
          mostra quais.
        </p>
      )}

      {agregado.linhasSemQuantidade > 0 && (
        <p className="xl-painel-nota">
          {agregado.linhasSemQuantidade}{" "}
          {agregado.linhasSemQuantidade === 1
            ? "atividade está"
            : "atividades estão"}{" "}
          fora da média por não terem quantidade. Medir a quantidade delas é o
          que faz o painel passar a refletir a obra.
        </p>
      )}
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  children,
  nota,
  tom,
}: {
  titulo: string;
  valor: string;
  children?: React.ReactNode;
  nota?: string;
  tom?: "ruim" | "bom";
}) {
  return (
    <div className={`xl-cartao${tom ? ` xl-cartao-${tom}` : ""}`}>
      <span className="xl-cartao-titulo">{titulo}</span>
      <strong className="xl-cartao-valor">{valor}</strong>
      {(children || nota) && <span className="xl-cartao-nota">{nota ?? children}</span>}
    </div>
  );
}

function Status({
  titulo,
  n,
  total,
  classe,
}: {
  titulo: string;
  n: number;
  total: number;
  classe: string;
}) {
  const fracao = total > 0 ? n / total : 0;
  return (
    <div className={`xl-status ${classe}`}>
      <div className="xl-status-topo">
        <span>{titulo}</span>
        <strong>{n}</strong>
      </div>
      <div className="xl-status-barra">
        <span style={{ width: `${Math.round(fracao * 100)}%` }} />
      </div>
      <span className="xl-status-nota">{pct(fracao)} das atividades</span>
    </div>
  );
}
