// Calendário de obra — camada pura, sem banco e sem rede.
//
// O CPM (shared/cpm.ts) já opera em **dias úteis inteiros**:
// earlyStart / earlyFinish / lateStart / lateFinish / totalFloat são
// índices nessa escala. O que falta é a conversão entre esse índice
// e uma data civil, governada por um calendário.
//
// Antes deste módulo, o Gantt convertia `startOffset * 86400000` a
// partir de `projects.plannedStart` — "dias corridos, sem feriados",
// como consta no comentário de GanttView.tsx. Este módulo substitui
// isso por dias úteis governados pelo calendário.
//
// Convenções:
//   * "2026-01-01" é uma data civil (ISO 8601, fuso local).
//   * O índice 0 é o primeiro dia útil >= plannedStart do projeto.
//   * addWorkingDays(start, 1) = o próximo dia útil.
//   * dateAt(start, 0) = o primeiro dia útil >= start.
import { addDays, getDay, parseISO } from "date-fns";

// ----------------------------------------------------------------- helpers
// Devolve a data civil no fuso local como "YYYY-MM-DD". Não usar
// `${date}` num template literal — o Date.toJSON() devolve o
// timestamp UTC e pode mudar o dia quando o fuso não é UTC.
function iso(d: Date): IsoDate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --------------------------------------------------------------------- tipos
export type IsoDate = string; // "YYYY-MM-DD", fuso local, sem hora

export type DayType = "working" | "national_holiday" | "facultative" | "observance";

export type WeekPattern = {
  /** 0 = domingo … 6 = sábado. Só os listados são úteis. */
  workingWeekdays: number[];
};

export type CalendarException = {
  date: IsoDate;
  type: DayType;
  name?: string;
};

export type WorkCalendar = {
  weekPattern: WeekPattern;
  exceptions: CalendarException[];
};

// --------------------------------------------------------- algoritmo da Páscoa
// Algoritmo de Sakamoto (gregoriano anônimo) — O(1), sem tabelas.
export function easterSunday(year: number): IsoDate {
  const y = year;
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ----------------------------------------------------- candidatos brasileiros
// Classificação legal verificada nas leis do Planalto:
//
//   Lei 662/1949 art. 1º (redação da Lei 10.607/2002):
//     1 jan · 21 abr · 1 mai · 7 set · 2 nov · 15 nov · 25 dez
//   Lei 14.759/2023: 20 nov — Dia Nacional de Zumbi e da Consciência Negra
//
//   Corpus Christi: feriado do Executivo federal (Lei 9.093/1995) e feriado
//   civil nos municípios/estados que o decreta — NÃO está no art. 1º de
//   Lei 662. É o feriado móvel mais observado em obras de construção.
//
//   Ponto facultativo (Lei 662/1949 art. 3º): Carnaval (seg/ter),
//   Sexta-feira Santa, Quarta-feira de Cinzas.
//
//   Observância (não é feriado nacional): 12 out (Aparecida),
//   24/25 dez (recesso), 31 dez (ponto facultativo federal).
//
// A distinção importa porque o art. 2º da Lei 662 permite atividade
// privada/administrativa *absolutamente indispensável* em feriado nacional —
// e obras com equipe contratada por turno frequentemente trabalham nesses
// dias. Por isso o calendário é dado (tipo + nome), nunca uma lista
// dura em código: quem decide se a obra para é o `work_calendars`.
export function brazilianHolidays(year: number): CalendarException[] {
  const easter = easterSunday(year);
  const d = (iso: IsoDate, name?: string) => ({
    date: iso,
    type: "national_holiday" as const,
    name,
  });
  const f = (iso: IsoDate, name?: string) => ({
    date: iso,
    type: "facultative" as const,
    name,
  });
  const o = (iso: IsoDate, name?: string) => ({
    date: iso,
    type: "observance" as const,
    name,
  });

  return [
    // Lei 662/1949 (art. 1º) — feriados nacionais fixos
    d(`${year}-01-01`, "Confraternização Universal"),
    d(`${year}-04-21`, "Tiradentes"),
    d(`${year}-05-01`, "Dia do Trabalho"),
    d(`${year}-09-07`, "Independência do Brasil"),
    d(`${year}-11-02`, "Finados"),
    d(`${year}-11-15`, "Proclamação da República"),
    d(`${year}-12-25`, "Natal"),
    // Lei 14.759/2023
    d(`${year}-11-20`, "Dia Nacional de Zumbi e da Consciência Negra"),
    // Lei 9.093/1995 — feriado do Executivo federal / amplamente observado
    d(iso(addDays(parseISO(easter), 60)), "Corpus Christi"),
    // Ponto facultativo (Lei 662/1949 art. 3º)
    f(iso(addDays(parseISO(easter), -48)), "Carnaval — segunda-feira"),
    f(iso(addDays(parseISO(easter), -47)), "Carnaval — terça-feira"),
    f(iso(addDays(parseISO(easter), -49)), "Quarta-feira de Cinzas"),
    f(iso(addDays(parseISO(easter), -2)), "Sexta-feira Santa"),
    // Observância — não é feriado nacional, mas obra costuma parar
    o(`${year}-10-12`, "Nossa Senhora Aparecida"),
    o(`${year}-12-24`, "Véspera de Natal"),
    o(`${year}-12-31`, "Réveillon"),
  ];
}

// ---------------------------------------------------------- o calendário
export function defaultCalendar(year: number): WorkCalendar {
  return {
    weekPattern: { workingWeekdays: [1, 2, 3, 4, 5] }, // 5×2 (seg→sex)
    exceptions: brazilianHolidays(year),
  };
}

function isWeekday(cal: WorkCalendar, d: Date): boolean {
  const dow = getDay(d); // 0 = domingo
  return cal.weekPattern.workingWeekdays.includes(dow);
}

function isException(cal: WorkCalendar, iso: IsoDate): CalendarException | undefined {
  return cal.exceptions.find((e) => e.date === iso);
}

/** Dia útil = dia da semana permitido E que não é exceção não-útil. */
export function isWorkingDay(cal: WorkCalendar, d: Date): boolean {
  if (!isWeekday(cal, d)) return false;
  const exDate = iso(d);
  const ex = isException(cal, exDate);
  if (!ex) return true;
  return ex.type === "working";
}

// ---------------------------------------------------------- index ↔ data
/** Primeiro dia útil >= start. Se start já é útil, retorna start. */
export function dateAt(
  cal: WorkCalendar,
  start: IsoDate,
  index: number
): IsoDate {
  let d = parseISO(start);
  // avança até o primeiro dia útil
  while (!isWorkingDay(cal, d)) d = addDays(d, 1);
  // agora 'd' é o dia útil no índice 0; adicione 'index' dias úteis
  let out = d;
  let count = 0;
  while (count < index) {
    out = addDays(out, 1);
    if (isWorkingDay(cal, out)) count++;
  }
  return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, "0")}-${String(out.getDate()).padStart(2, "0")}`;
}

/** Quantos dias úteis decorreram em [start, asOf). Dia do início conta como índice 0. */
export function elapsedWorkingDays(
  cal: WorkCalendar,
  start: IsoDate,
  asOf: IsoDate
): number {
  let count = 0;
  let d = parseISO(start);
  const end = parseISO(asOf);
  while (d < end) {
    if (isWorkingDay(cal, d)) count++;
    d = addDays(d, 1);
  }
  return count;
}

/** Dias úteis em [a, b). */
export function workingDaysBetween(
  cal: WorkCalendar,
  a: IsoDate,
  b: IsoDate
): number {
  return elapsedWorkingDays(cal, a, b);
}

/** O dia útil que está `n` dias úteis depois de start. n>=0 adianta; n<0 recua. */
export function addWorkingDays(
  cal: WorkCalendar,
  start: IsoDate,
  n: number
): IsoDate {
  if (n === 0) return start;
  const step = n >= 0 ? 1 : -1;
  const abs = Math.abs(n);
  let d = parseISO(start);
  let count = 0;
  while (count < abs) {
    d = addDays(d, step);
    if (isWorkingDay(cal, d)) count++;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Índice do dia na sequência de dias úteis a partir de start.
 *  Retorna o número de dias úteis em [start, date). Se date não é útil,
 *  retorna o índice em que ele se encontra (onde ficaria se fosse). */
export function indexOf(cal: WorkCalendar, start: IsoDate, date: IsoDate): number {
  return elapsedWorkingDays(cal, start, date);
}

/** Próximo dia útil estrito depois de d. */
export function nextWorkingDay(cal: WorkCalendar, d: IsoDate): IsoDate {
  return addWorkingDays(cal, d, 1);
}

// --------------------------------------------------------------- formatação
export function formatDate(iso: IsoDate): string {
  const d = parseISO(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
