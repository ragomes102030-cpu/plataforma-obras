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
import { and, eq } from "drizzle-orm";
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
 * Funde calendários de vários anos num só.
 *
 * `carregarCalendarioDaObra` cobre um ano — os feriados do padrão brasileiro
 * são calculados por ano. Um cronograma de 14 meses sempre cruza a virada, e
 * sem os feriados do segundo ano o EVM conta o 1º de janeiro como dia útil:
 * um dia a mais de PV, sem nenhum erro no caminho.
 *
 * O padrão semanal é o mesmo nos dois anos (vem de `work_calendars`), então se
 * copia o do primeiro. A `origem` piora para o não-`obra`: se um dos anos caiu
 * no padrão, é ele que a tela precisa saber.
 */
export function mesclarCalendarios(periodo: CalendarioDaObra[]): CalendarioDaObra {
  const [primeiro] = periodo;
  if (!primeiro) {
    return {
      calendar: { weekPattern: { workingWeekdays: [1, 2, 3, 4, 5] }, exceptions: [] },
      origem: "padrao_br",
      nome: null,
      ano: new Date().getFullYear(),
    };
  }
  const origem =
    periodo.every(item => item.origem === "obra")
      ? "obra"
      : (periodo.find(item => item.origem !== "obra")?.origem ?? "obra");
  return {
    calendar: {
      weekPattern: primeiro.calendar.weekPattern,
      exceptions: periodo.flatMap(item => item.calendar.exceptions),
    },
    origem,
    nome: primeiro.nome,
    ano: primeiro.ano,
  };
}

/**
 * Calendário da obra para um período que pode cruzar a virada do ano.
 *
 * É o que o EVM precisa: o tempo decorrido vai do início da obra até a data de
 * referência, e esse intervalo nem sempre cabe em um ano.
 */
export async function carregarCalendarioDoPeriodo(
  db: Db,
  projectId: number,
  anoInicio: number,
  anoFim: number
): Promise<CalendarioDaObra> {
  const anos = Array.from(
    { length: Math.max(1, anoFim - anoInicio + 1) },
    (_, indice) => anoInicio + indice
  );
  const carregados = await Promise.all(
    anos.map(ano => carregarCalendarioDaObra(db, projectId, ano))
  );
  return mesclarCalendarios(carregados);
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

/**
 * "Hoje" no fuso da obra (`America/Sao_Paulo`), não no fuso do servidor.
 *
 * O Render roda em UTC. Às 22h de Brasília já é o dia seguinte lá, então
 * `localIso(new Date())` devolvia a data de amanhã: o painel dizia "custo até
 * 22/10" no dia 21, e uma nota lançada hoje caía fora do corte de "hoje".
 * Data de obra é data do canteiro.
 */
export function hojeNoBrasil(agora: Date = new Date()): IsoDate {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const parte = (tipo: "year" | "month" | "day") =>
    partes.find(p => p.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

// ============================================================ escrita
//
// Toda a escrita do calendário vive AQUI, junto da leitura.
//
// O router não acessa `work_calendars` nem `calendar_exceptions` diretamente —
// e há um teste que trava isso (`server/cpm-restricoes.test.ts`, "o calendário
// da obra tem um único caminho de leitura"). A regra nasceu de um defeito real:
// duas fontes para a mesma verdade no mesmo arquivo. Mover a escrita para cá
// preserva a regra em vez de abri-la: continua existindo UM módulo dono do
// calendário, agora responsável pelos dois sentidos.

/** Cria ou atualiza o calendário da obra. Uma obra tem no máximo um. */
export async function salvarCalendarioDaObra(
  db: Db,
  projectId: number,
  name: string,
  workingWeekdays: number[]
): Promise<{ id: number; criado: boolean }> {
  const weekPattern = { workingWeekdays: [...workingWeekdays].sort((a, b) => a - b) };
  const [existente] = await db
    .select({ id: workCalendars.id })
    .from(workCalendars)
    .where(eq(workCalendars.projectId, projectId))
    .limit(1);
  if (existente) {
    await db
      .update(workCalendars)
      .set({ name, weekPattern })
      .where(eq(workCalendars.id, existente.id));
    return { id: existente.id, criado: false };
  }
  const [criado] = await db
    .insert(workCalendars)
    .values({ projectId, name, weekPattern })
    .returning({ id: workCalendars.id });
  return { id: criado.id, criado: true };
}

/** Id do calendário da obra, ou null. */
export async function idDoCalendarioDaObra(db: Db, projectId: number): Promise<number | null> {
  const [wc] = await db
    .select({ id: workCalendars.id })
    .from(workCalendars)
    .where(eq(workCalendars.projectId, projectId))
    .limit(1);
  return (wc?.id as number | undefined) ?? null;
}

/**
 * Acrescenta ou substitui uma exceção.
 *
 * O schema não tem unique index em (calendarId, date), então apagar a existente
 * antes de inserir é o que evita duas exceções para o mesmo dia — onde a que
 * fosse lida por último venceria por acaso.
 */
export async function salvarExcecaoDoCalendario(
  db: Db,
  projectId: number,
  date: IsoDate,
  type: DayType,
  name?: string
): Promise<{ id: number }> {
  const calendarId = await idDoCalendarioDaObra(db, projectId);
  if (calendarId === null) {
    throw new Error(
      "A obra ainda não tem calendário. Salve o calendário antes de cadastrar exceções."
    );
  }
  await db
    .delete(calendarExceptions)
    .where(and(eq(calendarExceptions.calendarId, calendarId), eq(calendarExceptions.date, date)));
  const [criada] = await db
    .insert(calendarExceptions)
    .values({ calendarId, date, type, name: name ?? null })
    .returning({ id: calendarExceptions.id });
  return { id: criada.id };
}

export async function removerExcecaoDoCalendario(
  db: Db,
  projectId: number,
  date: IsoDate
): Promise<{ removidas: number }> {
  const calendarId = await idDoCalendarioDaObra(db, projectId);
  if (calendarId === null) return { removidas: 0 };
  const removidas = await db
    .delete(calendarExceptions)
    .where(and(eq(calendarExceptions.calendarId, calendarId), eq(calendarExceptions.date, date)))
    .returning({ id: calendarExceptions.id });
  return { removidas: removidas.length };
}

/**
 * Materializa o padrão brasileiro como calendário DA OBRA.
 *
 * O padrão é calculado, não armazenado: enquanto ninguém salvar, `origem`
 * continua `padrao_br` e a tela não tem o que editar. Isto torna o padrão um
 * ponto de partida editável, preservando a decisão do engenheiro a partir dali.
 * Idempotente: regrava as exceções em vez de acumulá-las.
 */
export async function semearCalendarioPadrao(
  db: Db,
  projectId: number,
  ano: number
): Promise<{ calendarId: number; excecoes: number; criado: boolean }> {
  const padrao = defaultCalendar(ano);
  const existente = await idDoCalendarioDaObra(db, projectId);
  let calendarId = existente;
  if (calendarId === null) {
    const [criado] = await db
      .insert(workCalendars)
      .values({
        projectId,
        name: `Calendário padrão ${ano} (5x2 + feriados nacionais)`,
        weekPattern: padrao.weekPattern,
      })
      .returning({ id: workCalendars.id });
    calendarId = criado.id as number;
  }
  await db.delete(calendarExceptions).where(eq(calendarExceptions.calendarId, calendarId));
  if (padrao.exceptions.length) {
    await db.insert(calendarExceptions).values(
      padrao.exceptions.map(e => ({
        calendarId: calendarId as number,
        date: e.date,
        type: e.type,
        name: e.name ?? null,
      }))
    );
  }
  return { calendarId, excecoes: padrao.exceptions.length, criado: existente === null };
}
