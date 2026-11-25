import { and, eq, lt } from "drizzle-orm";
import { productionEntries, scheduleActivities } from "../../drizzle/schema";
import type { DbConexao } from "./lookahead-dados";
import { isoToLocalDate } from "./calendario-obra";
import { unitsCompatible } from "../../shared/price-sources/reconciliation";

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
      measurementUnit: productionEntries.measurementUnit,
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
  motivo: "codigo_ambiguo_na_versao_atual" | "atividade_sem_codigo" | "unidade_planejada_ausente" | "unidade_incompativel";
  unidadeRegistrada: string | null;
  unidadePlanejada: string | null;
};

export type LancamentoAlocado = {
  activityIdOriginal: number;
  activityId: number;
  wbsCode: string;
  quantity: string | number;
  measurementUnit: string;
  productionDate?: Date | string;
};

/**
 * Aloca produção pela identidade da atividade. Um lançamento antigo só pode
 * migrar pelo WBS quando esse código identifica exatamente uma atividade na
 * versão atual; caso contrário ele fica explícito para conciliação humana.
 */
export function alocarProducaoNaVersaoAtual(
  atividadesAtuais: readonly { id: number; wbsCode: string; unit?: string | null }[],
  todasAtividades: readonly { id: number; wbsCode: string; unit?: string | null }[],
  lancamentos: readonly { activityId: number; quantity: string | number; measurementUnit?: string | null; productionDate?: Date | string }[],
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
  const lancamentosAlocados: LancamentoAlocado[] = [];
  for (const lancamento of lancamentos) {
    const quantidade = Number(lancamento.quantity);
    if (!Number.isFinite(quantidade)) continue;
    let destino = atualPorId.get(lancamento.activityId);
    const codigo = codigoPorId.get(lancamento.activityId);
    if (!destino && !codigo) {
      producaoSemAlocacao.push({
        activityIdOriginal: lancamento.activityId,
        wbsCode: "",
        quantidade,
        motivo: "atividade_sem_codigo",
        unidadeRegistrada: lancamento.measurementUnit ?? null,
        unidadePlanejada: null,
      });
      continue;
    }
    if (!destino) {
      const candidatas = atuaisPorCodigo.get(codigo!) ?? [];
      if (candidatas.length === 1) destino = atualPorId.get(candidatas[0]!);
      else {
        producaoSemAlocacao.push({
          activityIdOriginal: lancamento.activityId,
          wbsCode: codigo!,
          quantidade,
          motivo: "codigo_ambiguo_na_versao_atual",
          unidadeRegistrada: lancamento.measurementUnit ?? null,
          unidadePlanejada: null,
        });
        continue;
      }
    }
    if (!destino) continue;
    if (!destino.unit?.trim()) {
      producaoSemAlocacao.push({
        activityIdOriginal: lancamento.activityId,
        wbsCode: destino.wbsCode,
        quantidade,
        motivo: "unidade_planejada_ausente",
        unidadeRegistrada: lancamento.measurementUnit ?? null,
        unidadePlanejada: null,
      });
      continue;
    }
    if (!unitsCompatible(lancamento.measurementUnit, destino.unit)) {
      producaoSemAlocacao.push({
        activityIdOriginal: lancamento.activityId,
        wbsCode: destino.wbsCode,
        quantidade,
        motivo: "unidade_incompativel",
        unidadeRegistrada: lancamento.measurementUnit ?? null,
        unidadePlanejada: destino.unit,
      });
      continue;
    }
    executadoPorAtividade.set(destino.id, (executadoPorAtividade.get(destino.id) ?? 0) + quantidade);
    lancamentosAlocados.push({
      activityIdOriginal: lancamento.activityId,
      activityId: destino.id,
      wbsCode: destino.wbsCode,
      quantity: lancamento.quantity,
      measurementUnit: lancamento.measurementUnit!,
      ...(lancamento.productionDate ? { productionDate: lancamento.productionDate } : {}),
    });
  }
  return { executadoPorAtividade, producaoSemAlocacao, lancamentosAlocados };
}
