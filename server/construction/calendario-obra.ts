/**
 * Carregamento do calendário de trabalho da obra.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * O calendário é dado da obra (`work_calendars.weekPattern` +
 * `calendar_exceptions`), não constante de código. Duas procedures do router já
 * tentavam lê-lo, e uma delas lia; a outra montava `defaultCalendar(ano)` e
 * seguia em frente — dois caminhos para a mesma verdade.
 *
 * Este módulo é o único lugar que decide. Sem calendário salvo, cai no padrão
 * brasileiro 5×2 com os feriados do ano, e **diz que caiu** (`origem`), para
 * que a tela possa avisar em vez de fingir que o padrão é a obra.
 *
 * A conversão de timestamp para data local é feita aqui uma vez, com o mesmo
 * `localIso` que o resto do servidor usa. Fuso é a causa clássica de "a data
 * está errada às vezes", e ela não pode depender de quem chamou.
 */
import { eq } from "drizzle-orm";
import { calendarExceptions, workCalendars } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  defaultCalendar,
  type DayType,
  type IsoDate,
  type WeekPattern,
  type WorkCalendar,
} from "../../shared/work-calendar";

/**
 * O mesmo tipo que o resto do código de construção usa. Declarar um `Db`
 * estrutural à mão não funciona: a assinatura de `from()` do drizzle é
 * genérica sobre `MySqlTable | Subquery | SQL`, e um `table: unknown` não é
 * atribuível a ela.
 */
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** De onde veio o calendário usado. A UI mostra, não esconde. */
export type OrigemDoCalendario = "obra" | "padrao_br" | "padrao_br_malformado";

export type CalendarioDaObra = {
  calendar: WorkCalendar;
  origem: OrigemDoCalendario;
  /** `null` quando veio do padrão — a tela deve então avisar. */
  nome: string | null;
  /** Ano do padrão, base dos feriados quando não há calendário da obra. */
  ano: number;
};

/**
 * Lê o calendário da obra. Nunca lança: calendário ausente ou malformado cai
 * no padrão brasileiro, e o motivo volta em `origem`.
 */
export async function carregarCalendarioDaObra(
  db: Db,
  projectId: number,
  ano: number
): Promise<CalendarioDaObra> {
  const padrao = defaultCalendar(ano);
  try {
    const [wc] = await db
      .select()
      .from(workCalendars)
      .where(eq(workCalendars.projectId, projectId))
      .limit(1);
    if (!wc) {
      return { calendar: padrao, origem: "padrao_br", nome: null, ano };
    }
    const bruto =
      typeof wc.weekPattern === "string"
        ? wc.weekPattern
        : JSON.stringify(wc.weekPattern);
    const weekPattern = JSON.parse(bruto) as WeekPattern;
    if (
      !weekPattern ||
      !Array.isArray(weekPattern.workingWeekdays) ||
      !weekPattern.workingWeekdays.length
    ) {
      // `weekPattern` vazio é configuração inválida, não "sem calendário": cair
      // no padrão silenciosamente esconderia erro de cadastro.
      return {
        calendar: padrao,
        origem: "padrao_br_malformado",
        nome: (wc.name as string | undefined) ?? null,
        ano,
      };
    }
    const excecoes = await db
      .select()
      .from(calendarExceptions)
      .where(eq(calendarExceptions.calendarId, wc.id as number))
      .orderBy(calendarExceptions.date);
    return {
      calendar: {
        weekPattern,
        exceptions: (excecoes ?? []).map(e => ({
          date: e.date as IsoDate,
          type: e.type as DayType,
          name: (e.name as string | undefined) ?? undefined,
        })),
      },
      origem: "obra",
      nome: (wc.name as string | undefined) ?? null,
      ano,
    };
  } catch {
    return {
      calendar: padrao,
      origem: "padrao_br_malformado",
      nome: null,
      ano,
    };
  }
}

/**
 * `Date` → `yyyy-mm-dd` no fuso **local do servidor**.
 *
 * Deliberadamente não é `toISOString()`: esse converte para UTC e, num servidor
 * em UTC com usuário em UTC−3, joga a data para o dia anterior. Foi assim que
 * a restrição de uma atividade podia cair no dia errado sem erro nenhum.
 */
export function localIso(d: Date): IsoDate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** `yyyy-mm-dd` → `Date` na meia-noite **local**, nunca UTC. */
export function isoToLocalDate(iso: IsoDate): Date {
  const [ano, mes, dia] = iso.split("-").map(Number) as [number, number, number];
  return new Date(ano, mes - 1, dia);
}
