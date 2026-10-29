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
