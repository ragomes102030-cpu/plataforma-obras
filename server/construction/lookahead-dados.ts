import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  planningConstraints,
  productionEntries,
  projects,
  scheduleActivities,
  weeklyCommitments,
} from "../../drizzle/schema";
import type { getDb } from "../db";
import { carregarCalendarioDoPeriodo, localIso, isoToLocalDate } from "./calendario-obra";
import { dateAt } from "../../shared/work-calendar";
import {
  segundaFeira,
  somarDias,
  type LookaheadActivity,
  type LookaheadCommitment,
  type LookaheadInput,
  type LookaheadReason,
} from "./lookahead";

/**
 * A leitura de dados do lookahead/PPC.
 *
 * Duas armadilhas de data moram aqui e valem o comentário:
 *
 *   `weekStart` é gravado como meia-noite UTC de uma segunda-feira. Comparar
 *   com `localIso()` (que é fuso do servidor) desloca a semana em um dia em
 *   qualquer servidor a oeste de Greenwich — a segunda vira domingo e o
 *   compromisso some do relatório. Por isso a conversão aqui é `toISOString`,
 *   não `localIso`, e o filtro SQL usa o instante exato.
 *
 *   As datas das atividades vêm do offset em DIAS ÚTEIS sobre o calendário da
 *   obra, nunca de soma de dias corridos: senão o lookahead de dezembro joga
 *   atividade para o meio do feriado.
 */

export type DbConexao = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type RestricaoAberta = {
  id: number;
  activityId: number;
  type: string;
  description: string;
  responsible: string | null;
  neededByIso: string | null;
};

export type DadosLookahead = {
  input: LookaheadInput;
  restricoesAbertas: RestricaoAberta[];
  /** Atividades sem duração/offset utilizáveis — ficam fora e são contadas. */
  atividadesSemData: number;
};

/** `Date` gravado como meia-noite UTC → `YYYY-MM-DD` sem passar por fuso local. */
function isoUtc(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export async function coletarDadosLookahead(
  db: DbConexao,
  projectId: number,
  semanaBaseIso: string,
  hojeIso: string,
  currentPlanVersionId: number | null
): Promise<DadosLookahead> {
  const [project] = await db
    .select({ plannedStart: projects.plannedStart })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const plannedStartIso = localIso(project?.plannedStart ?? isoToLocalDate(hojeIso));

  const base = segundaFeira(semanaBaseIso);
  // Duas semanas de folga além da janela para o calendário cobrir o último dia.
  const fimJanelaIso = somarDias(base, 10 * 7);

  const calendar = await carregarCalendarioDoPeriodo(
    db,
    projectId,
    Number(plannedStartIso.slice(0, 4)),
    Number(fimJanelaIso.slice(0, 4))
  );
  const cal = calendar.calendar;

  const versionScope =
    currentPlanVersionId == null
      ? isNull(scheduleActivities.versionId)
      : eq(scheduleActivities.versionId, currentPlanVersionId);

  const linhasDeAtividade = await db
    .select({
      id: scheduleActivities.id,
      wbsCode: scheduleActivities.wbsCode,
      name: scheduleActivities.name,
      unit: scheduleActivities.unit,
      plannedQuantity: scheduleActivities.plannedQuantity,
      durationDays: scheduleActivities.durationDays,
      earlyStart: scheduleActivities.earlyStart,
      startOffset: scheduleActivities.startOffset,
    })
    .from(scheduleActivities)
    .where(and(eq(scheduleActivities.projectId, projectId), versionScope));

  const asOf = isoToLocalDate(hojeIso);
  const entries = await db
    .select({
      activityId: productionEntries.activityId,
      quantity: productionEntries.quantity,
    })
    .from(productionEntries)
    .where(
      and(
        eq(productionEntries.projectId, projectId),
        eq(productionEntries.status, "confirmada"),
        // Corte em hoje: produção lançada com data futura ainda não aconteceu.
        lte(productionEntries.productionDate, asOf)
      )
    );

  const executadoPorAtividade = new Map<number, number>();
  for (const entry of entries) {
    if (entry.activityId == null) continue;
    executadoPorAtividade.set(
      entry.activityId,
      (executadoPorAtividade.get(entry.activityId) ?? 0) + Number(entry.quantity)
    );
  }

  const restricoes = await db
    .select({
      id: planningConstraints.id,
      activityId: planningConstraints.activityId,
      type: planningConstraints.type,
      description: planningConstraints.description,
      responsible: planningConstraints.responsible,
      neededBy: planningConstraints.neededBy,
    })
    .from(planningConstraints)
    .where(
      and(
        eq(planningConstraints.projectId, projectId),
        // `removida` e `cancelada` não bloqueiam mais. `em_andamento` bloqueia:
        // restrição em resolução ainda é restrição — contar como resolvida é
        // como marcar a tarefa de casa como feita por ter começado.
        inArray(planningConstraints.status, ["aberta", "em_andamento"])
      )
    );

  const abertasPorAtividade = new Map<number, number>();
  for (const restricao of restricoes) {
    abertasPorAtividade.set(
      restricao.activityId,
      (abertasPorAtividade.get(restricao.activityId) ?? 0) + 1
    );
  }

  let atividadesSemData = 0;
  const atividades: LookaheadActivity[] = [];
  for (const linha of linhasDeAtividade) {
    const duracao = Math.max(1, linha.durationDays ?? 1);
    const offset = linha.earlyStart ?? linha.startOffset ?? 0;
    if (!Number.isFinite(offset) || offset < 0) {
      atividadesSemData += 1;
      continue;
    }
    const startIso = dateAt(cal, plannedStartIso, offset);
    const finishIso = dateAt(cal, plannedStartIso, offset + duracao - 1);
    atividades.push({
      id: linha.id,
      wbsCode: linha.wbsCode ?? "",
      name: linha.name,
      unit: linha.unit,
      startIso,
      finishIso,
      plannedQuantity: Number(linha.plannedQuantity ?? 0),
      executedQuantity: executadoPorAtividade.get(linha.id) ?? 0,
      openConstraints: abertasPorAtividade.get(linha.id) ?? 0,
    });
  }

  // O filtro usa o instante exato (meia-noite UTC de segunda), que é como o
  // dado é gravado. `somarDias(base, 27)` cobre as 4 semanas da janela; a folga
  // de 3 dias absorve a semana extra que o relatório mostra como futura.
  const compromissos = await db
    .select({
      id: weeklyCommitments.id,
      activityId: weeklyCommitments.activityId,
      weekStart: weeklyCommitments.weekStart,
      status: weeklyCommitments.status,
      reason: weeklyCommitments.reason,
      plannedQuantity: weeklyCommitments.plannedQuantity,
      executedQuantity: weeklyCommitments.executedQuantity,
      responsible: weeklyCommitments.responsible,
    })
    .from(weeklyCommitments)
    .where(
      and(
        eq(weeklyCommitments.projectId, projectId),
        gte(weeklyCommitments.weekStart, new Date(`${base}T00:00:00Z`)),
        lte(weeklyCommitments.weekStart, new Date(`${somarDias(base, 27)}T00:00:00Z`))
      )
    );

  const compromissosTipados: LookaheadCommitment[] = compromissos.map(compromisso => ({
    id: compromisso.id,
    activityId: compromisso.activityId,
    weekStartIso: isoUtc(compromisso.weekStart),
    status: compromisso.status,
    reason: (compromisso.reason as LookaheadReason | null) ?? null,
    plannedQuantity:
      compromisso.plannedQuantity === null ? null : Number(compromisso.plannedQuantity),
    executedQuantity:
      compromisso.executedQuantity === null ? null : Number(compromisso.executedQuantity),
    responsible: compromisso.responsible,
  }));

  return {
    input: {
      atividades,
      compromissos: compromissosTipados,
      semanaBaseIso: base,
      hojeIso,
      semanas: 4,
    },
    restricoesAbertas: restricoes.map(restricao => ({
      id: restricao.id,
      activityId: restricao.activityId,
      type: restricao.type,
      description: restricao.description,
      responsible: restricao.responsible,
      neededByIso: restricao.neededBy ? isoUtc(restricao.neededBy) : null,
    })),
    atividadesSemData,
  };
}
