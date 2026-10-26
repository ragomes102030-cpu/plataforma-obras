import { and, desc, eq, inArray, lt, lte } from "drizzle-orm";
import {
  budgetItems,
  budgetVersions,
  measurementItems,
  measurements,
  productionEntries,
  scheduleActivities,
} from "../../drizzle/schema";
import type { DbConexao } from "../construction/lookahead-dados";
import type {
  ItemDeOrcamento,
  QuantidadePorItem,
} from "./medicao";

/**
 * Leitura dos dados da medição.
 *
 * Duas escolhas que valem explicação:
 *
 *   - A quantidade produzida vem de `production_entries` **confirmadas**, ligadas
 *     à atividade e, por ela, ao item de orçamento. Produção em rascunho não
 *     vira fatura.
 *   - O "já medido" considera medições aprovadas/faturadas/pagas com `periodEnd` ANTERIOR ao
 *     início do novo período. Usar `<= periodStart` pegaria a borda do dia e
 *     poderia contar duas vezes o mesmo dia.
 */

export type DadosMedicao = {
  itens: ItemDeOrcamento[];
  produzidoAcumulado: QuantidadePorItem[];
  medidoAcumuladoAnterior: QuantidadePorItem[];
  /** Quantidade produzida em atividade sem vínculo com item de orçamento. */
  produzidoSemItem: number;
  baseline: { versionId: number; versionNumber: number } | null;
};

function somar(lista: { budgetItemId: number | null; quantity: string | number }[]) {
  const mapa = new Map<number, number>();
  let semItem = 0;
  for (const linha of lista) {
    const valor = Number(linha.quantity) || 0;
    if (linha.budgetItemId == null) {
      semItem += valor;
      continue;
    }
    mapa.set(linha.budgetItemId, (mapa.get(linha.budgetItemId) ?? 0) + valor);
  }
  return { mapa, semItem };
}

export async function coletarDadosMedicao(
  db: DbConexao,
  projectId: number,
  periodStart: Date,
  periodEnd: Date
): Promise<DadosMedicao> {
  // Mesma baseline do EVM: a versão aprovada de maior número.
  const [baselineRow] = await db
    .select({ id: budgetVersions.id, versionNumber: budgetVersions.versionNumber })
    .from(budgetVersions)
    .where(
      and(eq(budgetVersions.projectId, projectId), eq(budgetVersions.status, "aprovado"))
    )
    .orderBy(desc(budgetVersions.versionNumber))
    .limit(1);

  const itens: ItemDeOrcamento[] = baselineRow
    ? (
        await db
          .select({
            budgetItemId: budgetItems.id,
            code: budgetItems.code,
            description: budgetItems.description,
            unit: budgetItems.unit,
            quantity: budgetItems.quantity,
            unitPrice: budgetItems.unitPrice,
          })
          .from(budgetItems)
          .where(eq(budgetItems.budgetVersionId, baselineRow.id))
      ).map(item => ({
        budgetItemId: item.budgetItemId,
        code: item.code,
        description: item.description,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      }))
    : [];

  const produzidas = await db
    .select({
      budgetItemId: scheduleActivities.budgetItemId,
      quantity: productionEntries.quantity,
    })
    .from(productionEntries)
    .leftJoin(
      scheduleActivities,
      eq(scheduleActivities.id, productionEntries.activityId)
    )
    .where(
      and(
        eq(productionEntries.projectId, projectId),
        eq(productionEntries.status, "confirmada"),
        lte(productionEntries.productionDate, periodEnd)
      )
    );

  const jaMedidas = await db
    .select({
      budgetItemId: measurementItems.budgetItemId,
      quantity: measurementItems.quantity,
    })
    .from(measurementItems)
    .innerJoin(measurements, eq(measurements.id, measurementItems.measurementId))
    .where(
      and(
        eq(measurements.projectId, projectId),
        // Rascunho/em aprovação não consomem saldo: a medição ainda não foi aceita.
        inArray(measurements.status, ["aprovada", "faturada", "paga"]),
        lt(measurements.periodEnd, periodStart)
      )
    );

  const produzido = somar(produzidas);
  const medido = somar(jaMedidas);

  const paraLista = (mapa: Map<number, number>): QuantidadePorItem[] =>
    [...mapa.entries()]
      .filter(([, quantity]) => quantity > 0)
      .map(([budgetItemId, quantity]) => ({ budgetItemId, quantity }));

  return {
    itens,
    produzidoAcumulado: paraLista(produzido.mapa),
    medidoAcumuladoAnterior: paraLista(medido.mapa),
    produzidoSemItem: produzido.semItem,
    baseline: baselineRow
      ? { versionId: baselineRow.id, versionNumber: baselineRow.versionNumber }
      : null,
  };
}
