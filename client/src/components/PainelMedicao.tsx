import { CircleDollarSign, FileCheck2, Plus, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Medição, faturamento e curva de desembolso.
 *
 * Duas telas de mercado, uma seção só — porque as duas saem do mesmo dado e
 * separá-las faz o engenheiro conferir dois números diferentes para a mesma
 * obra:
 *
 *   - MEDIÇÃO responde "quanto posso cobrar deste período?". Usa quantidade
 *     executada confirmada menos já medido. Não usa peso, não usa curva S.
 *   - DESEMBOLSO responde "quando o dinheiro sai, e quanto vai sair até o fim?".
 *     Usa o planejado rateado por dia útil e corrige o futuro pelo CPI.
 *
 * O botão "Conferir" NÃO grava nada: é a prévia. Só grava quando o número fecha
 * com o que o engenheiro viu na obra — e a nota nasce em rascunho, para poder
 * ser corrigida antes de virar cobrança.
 */

const brl = (valor: number | null | undefined): string =>
  valor == null
    ? "—"
    : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatarQuantidade = (valor: number): string =>
  valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const dataBr = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const data = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

const isoLocal = (data: Date): string => {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const primeiroDiaDoMes = (): string => {
  const agora = new Date();
  return isoLocal(new Date(agora.getFullYear(), agora.getMonth(), 1));
};

const ultimoDiaDoMes = (): string => {
  const agora = new Date();
  return isoLocal(new Date(agora.getFullYear(), agora.getMonth() + 1, 0));
};

const STATUS_ROTULO: Record<string, string> = {
  rascunho: "Rascunho",
  em_aprovacao: "Em aprovação",
  aprovada: "Aprovada",
  faturada: "Faturada",
  paga: "Paga",
  cancelada: "Cancelada",
};

type Acao = { status: Status; rotulo: string; primaria?: boolean; cancela?: boolean };

type Status =
  | "rascunho"
  | "em_aprovacao"
  | "aprovada"
  | "faturada"
  | "paga"
  | "cancelada";

/** Ações oferecidas por estado — espelham `TRANSICOES` de `server/financeiro/medicao.ts`. */
const ACOES: Record<string, Acao[]> = {
  rascunho: [
    { status: "em_aprovacao", rotulo: "Enviar p/ aprovação" },
    { status: "aprovada", rotulo: "Aprovar", primaria: true },
    { status: "cancelada", rotulo: "Cancelar", cancela: true },
  ],
  em_aprovacao: [
    { status: "aprovada", rotulo: "Aprovar", primaria: true },
    { status: "rascunho", rotulo: "Devolver" },
    { status: "cancelada", rotulo: "Cancelar", cancela: true },
  ],
  aprovada: [
    { status: "faturada", rotulo: "Faturar", primaria: true },
    { status: "cancelada", rotulo: "Cancelar", cancela: true },
  ],
  faturada: [{ status: "paga", rotulo: "Registrar pagamento", primaria: true }],
  paga: [],
  cancelada: [],
};

export function PainelMedicao({ projetoId }: { projetoId: number }) {
  const utils = trpc.useUtils();

  const [inicio, setInicio] = useState(primeiroDiaDoMes);
  const [fim, setFim] = useState(ultimoDiaDoMes);
  const [retencao, setRetencao] = useState("0");
  const [conferido, setConferido] = useState<{
    inicio: string;
    fim: string;
    retencao: number;
  } | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const notas = trpc.financeiro.medicoes.useQuery({ projectId: projetoId });
  const desembolso = trpc.financeiro.desembolso.useQuery({ projectId: projetoId });

  const simular = trpc.financeiro.simularMedicao.useQuery(
    {
      projectId: projetoId,
      periodStart: conferido?.inicio ?? inicio,
      periodEnd: conferido?.fim ?? fim,
      retentionPercent: conferido?.retencao ?? 0,
    },
    { enabled: conferido !== null }
  );

  const invalidar = async () => {
    await Promise.all([
      utils.financeiro.medicoes.invalidate({ projectId: projetoId }),
      utils.financeiro.simularMedicao.invalidate(),
      utils.financeiro.desembolso.invalidate({ projectId: projetoId }),
    ]);
  };

  const aoFalhar = (erro: { message: string }) => setMensagem(erro.message);

  const criar = trpc.financeiro.criarMedicao.useMutation({
    onSuccess: async resultado => {
      setMensagem(`Medição ${resultado.number} gravada como rascunho.`);
      setConferido(null);
      await invalidar();
    },
    onError: aoFalhar,
  });

  const avancar = trpc.financeiro.avancarStatus.useMutation({
    onSuccess: async () => {
      setMensagem("Status atualizado.");
      await invalidar();
    },
    onError: aoFalhar,
  });

  const conferir = () => {
    setMensagem(null);
    const valorRetencao = Number(retencao.replace(",", "."));
    if (!Number.isFinite(valorRetencao) || valorRetencao < 0 || valorRetencao > 100) {
      setMensagem("Retenção deve ser um número entre 0 e 100.");
      return;
    }
    if (inicio >= fim) {
      setMensagem("A data final do período precisa ser depois da inicial.");
      return;
    }
    setConferido({ inicio, fim, retencao: valorRetencao });
  };

  const gravar = () => {
    if (!conferido) return;
    criar.mutate({
      projectId: projetoId,
      periodStart: conferido.inicio,
      periodEnd: conferido.fim,
      retentionPercent: conferido.retencao,
    });
  };

  const lista = notas.data?.itens ?? [];
  const previa = simular.data;
  const fluxo = desembolso.data;

  const maiorProjecao = useMemo(() => {
    const valores = (fluxo?.meses ?? []).map(mes =>
      Math.max(mes.planejado, mes.realizado, mes.projetado)
    );
    return valores.length > 0 ? Math.max(...valores) : 0;
  }, [fluxo]);

  return (
    <section className="pl-med">
      <header className="pl-med-topo">
        <div>
          <h3>
            <FileCheck2 size={16} /> Medição e faturamento
          </h3>
          <p className="pl-med-sub">
            Só cobra o que foi produzido depois do que já foi medido. Nota nasce
            em rascunho e só vira cobrança depois de aprovada.
          </p>
        </div>
        <div className="pl-med-total">
          <span>Faturado</span>
          <strong>
            {brl(
              lista
                .filter(nota => nota.status === "faturada" || nota.status === "paga")
                .reduce((soma, nota) => soma + nota.liquido, 0)
            )}
          </strong>
          <span className="pl-med-mini">
            {lista.filter(nota => nota.status === "aprovada").length} aprovada(s)
            aguardando nota fiscal
          </span>
        </div>
      </header>

      {!notas.data?.available && notas.data?.note && (
        <p className="pl-med-aviso">
          <TriangleAlert size={14} /> {notas.data.note}
        </p>
      )}

      <div className="pl-med-form">
        <label>
          Início do período
          <input
            type="date"
            value={inicio}
            onChange={evento => setInicio(evento.target.value)}
          />
        </label>
        <label>
          Fim do período
          <input
            type="date"
            value={fim}
            onChange={evento => setFim(evento.target.value)}
          />
        </label>
        <label>
          Retenção técnica (%)
          <input
            inputMode="decimal"
            value={retencao}
            onChange={evento => setRetencao(evento.target.value)}
          />
        </label>
        <button type="button" className="pl-med-botao" onClick={conferir}>
          Conferir
        </button>
      </div>

      {mensagem && <p className="pl-med-sub">{mensagem}</p>}

      {conferido && previa && (
        <div className="pl-med-previa">
          <div className="pl-med-kpis">
            <Kpi titulo="Bruto do período" valor={brl(previa.bruto)} />
            <Kpi titulo="Retenção" valor={brl(previa.retencao)} />
            <Kpi titulo="Líquido a faturar" valor={brl(previa.liquido)} />
            <Kpi titulo="Acumulado produzido" valor={brl(previa.totalAcumulado)} />
            <Kpi titulo="Contratado" valor={brl(previa.totalContratado)} />
            <Kpi
              titulo="Saldo a executar"
              valor={brl(previa.saldoTotal)}
              alerta={previa.saldoTotal < 0}
            />
          </div>

          {previa.produzidoSemItem > 0 && (
            <p className="pl-med-aviso">
              <TriangleAlert size={14} />
              {previa.itens.length === 0
                ? `Há ${formatarQuantidade(previa.produzidoSemItem)} unidade(s) produzidas no período em atividades sem item de orçamento, e por isso não entram na medição. Vincule as atividades na Conciliação com o orçamento (logo abaixo).`
                : `${formatarQuantidade(previa.produzidoSemItem)} unidade(s) produzidas no período ficaram fora por falta de vínculo com o orçamento.`}
            </p>
          )}

          {previa.avisos
            // Com produção não vinculada, "nada novo produzido" é falso e manda
            // o engenheiro procurar produção que existe. O aviso acima já diz o
            // que realmente aconteceu.
            .filter(
              aviso =>
                !(previa.produzidoSemItem > 0 && aviso.includes("Nada novo produzido"))
            )
            .map(aviso => (
              <p key={aviso} className="pl-med-aviso">
                <TriangleAlert size={14} /> {aviso}
              </p>
            ))}

          {previa.itens.length > 0 && (
            <div className="pl-med-tabela">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Descrição</th>
                    <th className="pl-med-num">Já medido</th>
                    <th className="pl-med-num">Produzido acum.</th>
                    <th className="pl-med-num">A medir agora</th>
                    <th className="pl-med-num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.itens.map(item => (
                    <tr key={item.budgetItemId}>
                      <td>{item.code}</td>
                      <td>{item.description}</td>
                      <td className="pl-med-num">{item.quantidadeAnterior.toFixed(3)}</td>
                      <td className="pl-med-num">
                        {item.quantidadeAcumulada.toFixed(3)} {item.unit}
                      </td>
                      <td className="pl-med-num">
                        {item.quantidadeNoPeriodo.toFixed(3)}
                      </td>
                      <td className="pl-med-num">{brl(item.valorNoPeriodo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pl-med-acoes">
            <button
              type="button"
              className="pl-med-botao pl-med-primario"
              onClick={gravar}
              disabled={criar.isPending || previa.itens.length === 0}
            >
              <Plus size={14} /> {criar.isPending ? "Gravando…" : "Gravar medição"}
            </button>
            <button
              type="button"
              className="pl-med-link"
              onClick={() => setConferido(null)}
            >
              <X size={13} /> Fechar prévia
            </button>
          </div>
        </div>
      )}

      <div className="pl-med-tabela">
        <table>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Período</th>
              <th>Status</th>
              <th className="pl-med-num">Bruto</th>
              <th className="pl-med-num">Retenção</th>
              <th className="pl-med-num">Líquido</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="pl-med-vazio">
                  Nenhuma medição ainda. Escolha o período e clique em Conferir.
                </td>
              </tr>
            )}
            {lista.map(nota => (
              <tr
                key={nota.id}
                className={nota.status === "cancelada" ? "pl-med-cancelada" : undefined}
              >
                <td>{nota.number}</td>
                <td>
                  {dataBr(nota.periodStart)} – {dataBr(nota.periodEnd)}
                </td>
                <td>
                  <span className={`pl-med-status pl-med-status-${nota.status}`}>
                    {STATUS_ROTULO[nota.status] ?? nota.status}
                  </span>
                </td>
                <td className="pl-med-num">{brl(nota.bruto)}</td>
                <td className="pl-med-num">{brl(nota.retencao)}</td>
                <td className="pl-med-num">{brl(nota.liquido)}</td>
                <td className="pl-med-acoes-celula">
                  {(ACOES[nota.status] ?? []).map(acao => (
                    <button
                      key={acao.status}
                      type="button"
                      className={`pl-med-link${acao.primaria ? " pl-med-link-primaria" : ""}${
                        acao.cancela ? " pl-med-link-cancela" : ""
                      }`}
                      onClick={() =>
                        avancar.mutate({
                          projectId: projetoId,
                          measurementId: nota.id,
                          status: acao.status,
                        })
                      }
                      disabled={avancar.isPending}
                    >
                      {acao.rotulo}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <header className="pl-med-topo pl-med-topo-fluxo">
        <div>
          <h3>
            <CircleDollarSign size={16} /> Curva de desembolso
          </h3>
          <p className="pl-med-sub">
            O que já saiu, o planejado e a projeção corrigida pelo CPI
            {fluxo?.cpi != null
              ? ` (CPI ${fluxo.cpi.toFixed(3).replace(".", ",")})`
              : " (sem CPI — projeção sem correção)"}
            .{fluxo?.asOf ? ` Realizado até ${dataBr(fluxo.asOf)}.` : ""}
          </p>
        </div>
      </header>

      {fluxo && fluxo.available && (
        <>
          <div className="pl-med-kpis">
            <Kpi titulo="BAC — orçamento" valor={brl(fluxo.bac)} />
            <Kpi titulo="Realizado" valor={brl(fluxo.realizadoTotal)} />
            <Kpi titulo="Projetado total" valor={brl(fluxo.projetadoTotal)} />
            <Kpi
              titulo="Desvio projetado"
              valor={fluxo.desvioProjetado == null ? "—" : brl(fluxo.desvioProjetado)}
              alerta={(fluxo.desvioProjetado ?? 0) > 0}
            />
          </div>

          {fluxo.alertas.map(alerta => (
            <p key={alerta} className="pl-med-aviso">
              <TriangleAlert size={14} /> {alerta}
            </p>
          ))}

          {fluxo.meses.length === 0 ? (
            <p className="pl-med-sub">
              Sem planejamento nem custo lançado até {dataBr(fluxo.asOf)}.
            </p>
          ) : (
            <div className="pl-med-grafico">
              {fluxo.meses.map(mes => (
                <div key={mes.mes} className="pl-med-mes">
                  <span className="pl-med-mes-rotulo">
                    {mes.mes.slice(5)}/{mes.mes.slice(0, 4)}
                  </span>
                  <div className="pl-med-barras">
                    <Barra
                      classe="planejado"
                      valor={mes.planejado}
                      maior={maiorProjecao}
                      titulo="planejado"
                    />
                    <Barra
                      classe="realizado"
                      valor={mes.realizado}
                      maior={maiorProjecao}
                      titulo="realizado"
                    />
                    <Barra
                      classe="projetado"
                      valor={mes.projetado}
                      maior={maiorProjecao}
                      titulo="projetado"
                    />
                  </div>
                  <span className="pl-med-mes-num">
                    {/* Mês passado/corrente mostra o que SAIU; só o futuro
                        mostra projeção. Rotular a projeção (que nesses meses é
                        zero) faz parecer que nada foi planejado para o mês. */}
                    {mes.situacao === "futuro"
                      ? brl(mes.projetado)
                      : brl(mes.realizado)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="pl-med-legenda">
            <span className="pl-med-chip pl-med-chip-planejado" /> planejado
            <span className="pl-med-chip pl-med-chip-realizado" /> realizado
            <span className="pl-med-chip pl-med-chip-projetado" /> projetado
          </p>
        </>
      )}
    </section>
  );
}

function Kpi({
  titulo,
  valor,
  alerta,
}: {
  titulo: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div className={`pl-med-cartao${alerta ? " pl-med-cartao-alerta" : ""}`}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
    </div>
  );
}

function Barra({
  classe,
  valor,
  maior,
  titulo,
}: {
  classe: string;
  valor: number;
  maior: number;
  titulo: string;
}) {
  const largura = maior > 0 ? Math.min(100, (valor / maior) * 100) : 0;
  return (
    <div
      className={`pl-med-barra pl-med-barra-${classe}`}
      style={{ width: `${largura}%` }}
      title={`${titulo}: ${brl(valor)}`}
    />
  );
}
