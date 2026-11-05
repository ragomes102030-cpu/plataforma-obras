import { dateAt, type WorkCalendar } from "./work-calendar";

/** Datas civis congeladas no ato da captura; nunca reconverter pelo calendário atual. */
export type BaselineActivityDate = {
  activityId: number;
  wbsCode: string | null;
  name: string;
  inicio: string;
  fim: string;
};

export function congelarDatasBaseline(
  atividades: readonly { id: number; wbsCode: string | null; name: string; earlyStart: number | null; earlyFinish: number | null }[],
  inicioObra: string,
  calendario: WorkCalendar,
): BaselineActivityDate[] {
  return atividades.map(atividade => {
    const { earlyStart, earlyFinish } = atividade;
    if (earlyStart == null || earlyFinish == null || !Number.isInteger(earlyStart) ||
      !Number.isInteger(earlyFinish) || earlyStart < 0 || earlyFinish < earlyStart) {
      throw new Error(`Atividade ${atividade.id} possui índices CPM inválidos para a fotografia civil.`);
    }
    return {
      activityId: atividade.id, wbsCode: atividade.wbsCode, name: atividade.name,
      inicio: dateAt(calendario, inicioObra, earlyStart),
      fim: dateAt(calendario, inicioObra, Math.max(earlyStart, earlyFinish - 1)),
    };
  });
}

const dataCivilValida = (valor: unknown): valor is string =>
  typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
  Number.isFinite(Date.parse(`${valor}T12:00:00Z`)) &&
  new Date(`${valor}T12:00:00Z`).toISOString().slice(0, 10) === valor;

/** Fotografia ausente/legada ou inválida nunca ganha datas reconstruídas. */
export function lerDatasCapturadasBaseline(payload: unknown, baselineId: number): BaselineActivityDate[] | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (value.baselineId !== baselineId || value.snapshotVersion !== 1 || !Array.isArray(value.activityDates) || value.activityDates.length === 0) return null;
  const ids = new Set<number>();
  for (const item of value.activityDates) {
    if (!item || typeof item !== "object" || !Number.isInteger(item.activityId) || item.activityId <= 0 ||
      ids.has(item.activityId) || (item.wbsCode !== null && typeof item.wbsCode !== "string") ||
      typeof item.name !== "string" || !dataCivilValida(item.inicio) || !dataCivilValida(item.fim) || item.fim < item.inicio) return null;
    ids.add(item.activityId);
  }
  return value.activityDates as BaselineActivityDate[];
}
