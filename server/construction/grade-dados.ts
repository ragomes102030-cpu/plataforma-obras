import { and, eq, lt } from "drizzle-orm";
import { productionEntries, scheduleActivities } from "../../drizzle/schema";
import type { DbConexao } from "./lookahead-dados";
import { isoToLocalDate } from "./calendario-obra";

/** Retorna somente produção confirmada, real e ocorrida até a data de referência. */
export function coletarLancamentosExecutados(
  db: DbConexao,
  projectId: number,
  asOfIso: string,
) {
  const inicioDoDiaSeguinte = isoToLocalDate(asOfIso);
  inicioDoDiaSeguinte.setDate(inicioDoDiaSeguinte.getDate() + 1);
  return db
    .select({
      id: productionEntries.id,
      activityId: productionEntries.activityId,
      productionDate: productionEntries.productionDate,
      quantity: productionEntries.quantity,
    })
    .from(productionEntries)
    .innerJoin(scheduleActivities, eq(productionEntries.activityId, scheduleActivities.id))
    .where(and(
      eq(productionEntries.projectId, projectId),
      eq(scheduleActivities.projectId, projectId),
      eq(productionEntries.status, "confirmada"),
      eq(productionEntries.exemplo, 0),
      eq(scheduleActivities.exemplo, 0),
      lt(productionEntries.productionDate, inicioDoDiaSeguinte),
    ))
    .orderBy(productionEntries.productionDate, productionEntries.id);
}

export type ProducaoSemAlocacao = {
  activityIdOriginal: number;
  wbsCode: string;
  quantidade: number;
  motivo: "codigo_ambiguo_na_versao_atual" | "atividade_sem_codigo";
};

/**
 * Aloca produção pela identidade da atividade. Um lançamento antigo só pode
 * migrar pelo WBS quando esse código identifica exatamente uma atividade na
 * versão atual; caso contrário ele fica explícito para conciliação humana.
 */
export function alocarProducaoNaVersaoAtual(
  atividadesAtuais: readonly { id: number; wbsCode: string }[],
  todasAtividades: readonly { id: number; wbsCode: string }[],
  lancamentos: readonly { activityId: number; quantity: string | number }[],
) {
  const atualPorId = new Map(atividadesAtuais.map(atividade => [atividade.id, atividade]));
  const codigoPorId = new Map(todasAtividades.map(atividade => [atividade.id, atividade.wbsCode]));
  const atuaisPorCodigo = new Map<string, number[]>();
  for (const atividade of atividadesAtuais) {
    const ids = atuaisPorCodigo.get(atividade.wbsCode) ?? [];
    ids.push(atividade.id);
    atuaisPorCodigo.set(atividade.wbsCode, ids);
  }

  const executadoPorAtividade = new Map<number, number>();
  const producaoSemAlocacao: ProducaoSemAlocacao[] = [];
  for (const lancamento of lancamentos) {
    const quantidade = Number(lancamento.quantity);
    if (!Number.isFinite(quantidade)) continue;
    const atividadeAtual = atualPorId.get(lancamento.activityId);
    if (atividadeAtual) {
      executadoPorAtividade.set(
        atividadeAtual.id,
        (executadoPorAtividade.get(atividadeAtual.id) ?? 0) + quantidade,
      );
      continue;
    }
    const codigo = codigoPorId.get(lancamento.activityId);
    if (!codigo) {
      producaoSemAlocacao.push({
        activityIdOriginal: lancamento.activityId,
        wbsCode: "",
        quantidade,
        motivo: "atividade_sem_codigo",
      });
      continue;
    }
    const candidatas = atuaisPorCodigo.get(codigo) ?? [];
    if (candidatas.length === 1) {
      const id = candidatas[0]!;
      executadoPorAtividade.set(id, (executadoPorAtividade.get(id) ?? 0) + quantidade);
      continue;
    }
    producaoSemAlocacao.push({
      activityIdOriginal: lancamento.activityId,
      wbsCode: codigo,
      quantidade,
      motivo: "codigo_ambiguo_na_versao_atual",
    });
  }
  return { executadoPorAtividade, producaoSemAlocacao };
}
