import { and, eq } from "drizzle-orm";
import { productionEntries, scheduleActivities } from "../drizzle/schema";
import { getCurrentPlanVersion } from "./construction/plan-versions";
import type { getDb } from "./db";

/**
 * O AVANÇO REAL DA OBRA, LIGADO POR CÓDIGO DA EAP — NÃO POR ID DE LINHA.
 *
 * Cada lançamento de produção guarda o `activityId` que existia no dia em que foi
 * digitado. Atividade é linha de UMA versão do plano: quando a EAP é regerada, as
 * linhas são recriadas com outros ids e o lançamento passa a apontar para o
 * passado. Até 22/10/2026 o cálculo somava só `entry.activityId` na própria
 * atividade — então 10 lançamentos confirmados da AURORA TESTE (03/10 a 25/10,
 * R$ 318 mil de serviço) não mexiam em nada: as atividades atuais ficavam em
 * "% Real = 0" e a Curva S dizia "Obra no prazo, 0,0%".
 *
 * O código da EAP (`1.2.3`) é o que se mantém entre versões — é o que o orçamento
 * usa para casar item e pacote, e é o que o engenheiro lê no cronograma. Aqui ele
 * é a chave: somam-se os lançamentos confirmados pelo código da atividade de
 * origem e o total é aplicado na atividade do mesmo código NA VERSÃO ATUAL.
 */

export type AtividadeParaProgresso = {
  id: number;
  versionId: number | null;
  wbsCode: string;
  plannedQuantity: string | number | null;
};

export type LancamentoConfirmado = {
  activityId: number;
  quantity: string | number;
  status: string;
};

export type ProgressoDaAtividade = {
  progress: number;
  /** Quantidade confirmada somada (em qualquer versão do plano). */
  total: number;
  /** Quantidade planejada na atividade atual; 0 = não dá para calcular %. */
  planned: number;
};

export type VinculoDoLancamento = "atual" | "versao_anterior" | "perdido";

/** O que é "versão atual": a maior `versionNumber`, ou `null` se a obra não tem versão. */
export function ehDaVersaoAtual(
  atividade: { versionId: number | null },
  versaoAtualId: number | null
): boolean {
  return versaoAtualId === null ? atividade.versionId === null : atividade.versionId === versaoAtualId;
}

/**
 * Soma os lançamentos CONFIRMADOS por código da EAP e devolve o progresso de cada
 * atividade da versão atual (inclusive as que estão em 0).
 */
export function calcularProgressoReal(
  lancamentos: LancamentoConfirmado[],
  atividades: AtividadeParaProgresso[],
  versaoAtualId: number | null
): Map<number, ProgressoDaAtividade> {
  const porId = new Map(atividades.map(a => [a.id, a]));
  const atuaisPorCodigo = new Map<string, AtividadeParaProgresso>();
  for (const atividade of atividades) {
    if (ehDaVersaoAtual(atividade, versaoAtualId)) {
      atuaisPorCodigo.set(atividade.wbsCode, atividade);
    }
  }

  const somas = new Map<number, number>();
  for (const lancamento of lancamentos) {
    if (lancamento.status !== "confirmada") continue;
    const origem = porId.get(lancamento.activityId);
    // Atividade de origem apagada: não há código para casar, o lançamento fica
    // visível na tela como "perdido" e não inventa progresso.
    if (!origem) continue;
    const alvo = atuaisPorCodigo.get(origem.wbsCode) ?? origem;
    somas.set(alvo.id, (somas.get(alvo.id) ?? 0) + Number(lancamento.quantity ?? 0));
  }

  const resultado = new Map<number, ProgressoDaAtividade>();
  for (const atividade of atuaisPorCodigo.values()) {
    const total = somas.get(atividade.id) ?? 0;
    const planned = Number(atividade.plannedQuantity ?? 0);
    const progress = planned > 0 ? Math.min(100, Math.round((total / planned) * 100)) : 0;
    resultado.set(atividade.id, { progress, total, planned });
  }
  return resultado;
}

/**
 * Produção é registro do que JÁ aconteceu. Até 22/10/2026 dava para lançar em
 * qualquer data — a AURORA TESTE tinha um apontamento em 25/10 enquanto o
 * sistema marcava 22/10, e a Curva S somava esse "futuro" no realizado.
 *
 * Compara dia com dia em UTC: o valor gravado é uma data (meia-noite), então
 * "hoje" às 15h não pode reprovar um lançamento de hoje.
 */
export function ehDataFutura(data: Date, agora: Date = new Date()): boolean {
  if (Number.isNaN(data.getTime())) return false;
  const alvo = Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  return alvo > hoje;
}

/** Como cada lançamento está preso ao plano de hoje. */
export function classificarLancamento(
  activityId: number,
  atividades: AtividadeParaProgresso[],
  versaoAtualId: number | null
): VinculoDoLancamento {
  const origem = atividades.find(a => a.id === activityId);
  if (!origem) return "perdido";
  if (ehDaVersaoAtual(origem, versaoAtualId)) return "atual";
  const atual = atividades.some(a => ehDaVersaoAtual(a, versaoAtualId) && a.wbsCode === origem.wbsCode);
  // A versão mudou, mas o código existe hoje: o lançamento continua valendo.
  return atual ? "versao_anterior" : "perdido";
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Recalcula `% Real` de todas as atividades da versão atual da obra e devolve o
 * que mudou. Toda escrita em produção (criar, confirmar, editar, excluir) passa
 * por aqui — antes cada rota repetia a conta e só `confirmEntry` fazia, no id
 * errado.
 */
export async function recalcularAvancoReal(
  db: Db,
  projectId: number
): Promise<{ versaoAtualId: number | null; atualizadas: number; lancamentosPerdidos: number }> {
  // `getCurrentPlanVersion` é a definição única de "versão atual" no sistema
  // (maior `versionNumber`); reaproveitar evita uma segunda regra divergindo.
  const versaoAtual = await getCurrentPlanVersion(projectId);
  const versaoAtualId = versaoAtual?.id ?? null;

  const atividades = await db
    .select({
      id: scheduleActivities.id,
      versionId: scheduleActivities.versionId,
      wbsCode: scheduleActivities.wbsCode,
      plannedQuantity: scheduleActivities.plannedQuantity,
    })
    .from(scheduleActivities)
    .where(eq(scheduleActivities.projectId, projectId));

  const lancamentos = await db
    .select({
      activityId: productionEntries.activityId,
      quantity: productionEntries.quantity,
      status: productionEntries.status,
    })
    .from(productionEntries)
    .where(and(eq(productionEntries.projectId, projectId), eq(productionEntries.status, "confirmada")));

  const progresso = calcularProgressoReal(lancamentos, atividades, versaoAtualId);
  const perdidos = lancamentos.filter(
    lancamento => classificarLancamento(lancamento.activityId, atividades, versaoAtualId) === "perdido"
  ).length;

  let atualizadas = 0;
  for (const [activityId, dados] of progresso) {
    await db
      .update(scheduleActivities)
      .set({
        progress: dados.progress,
        status:
          dados.progress >= 100 ? "Concluído" : dados.progress > 0 ? "Em andamento" : "Não iniciado",
      })
      .where(eq(scheduleActivities.id, activityId));
    atualizadas += 1;
  }

  return { versaoAtualId, atualizadas, lancamentosPerdidos: perdidos };
}
