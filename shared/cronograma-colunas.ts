import { dateAt, indexOf, type IsoDate, type WorkCalendar } from "./work-calendar";

/**
 * As colunas da planilha, calculadas fora do navegador.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * A planilha de referência (`Relatorio_Progresso_Obra_PROFISSIONAL.xlsx`) tem
 * seis abas e a grade `CRONOGRAMA` é o centro. As colunas dela não são todas
 * digitadas — cinco são fórmula:
 *
 *   Fim             =E5+G5-1
 *   Produtividade   =IF(G5>0,H5/G5,0)
 *   % Planej.       =IF(G5>0,MAX(0,MIN(1,(HOJE-E5+1)/G5)),0)
 *   % Real          =IF(H5>0,SUMIF(PRODUCAO!$B:$B,A5,PRODUCAO!$C:$C)/H5,0)
 *   Status          =IF(L5>=1,"Concluido",IF(L5>0,"Em andamento",
 *                    IF(HOJE>F5,"Atrasado","Nao iniciado")))
 *
 * A regra do projeto é que o backend e os motores determinísticos são a fonte
 * da verdade e o frontend não descobre regra. Então cada fórmula acima vira uma
 * função pura aqui, e a grade do React só desenha o que esta função devolve.
 *
 * DIAS CORRIDOS POR PADRÃO
 *
 * A planilha conta dias corridos: `Fim = Início + Duração − 1`, com o `+1`
 * inclusivo e sem feriado nenhum. O sistema já tem um único caminho de data
 * (`work-calendar.ts` + `calendario-obra.ts`), e ele é escrito em dias úteis.
 * Em vez de abrir um segundo caminho para dias corridos, o dia corrido é
 * simplesmente um calendário cuja semana tem os sete dias e não tem exceção —
 * `dateAt` continua sendo a única função que converte índice em data. Obra sem
 * calendário cadastrado usa este; obra com calendário usa o dela.
 */

/** Semana de sete dias, sem exceção: é o "dia corrido" da planilha. */
export const CALENDARIO_CORRIDO: WorkCalendar = {
  weekPattern: { workingWeekdays: [0, 1, 2, 3, 4, 5, 6] },
  exceptions: [],
};

export type StatusDaLinha =
  | "Concluido"
  | "Em andamento"
  | "Atrasado"
  | "Nao iniciado";

/** O que o usuário informa. Só isso é entrada; o resto é derivado. */
export type EntradaDaLinha = {
  codigo: string;
  atividade: string;
  frente: string;
  pavimento: string | null;
  /** Data de início, "YYYY-MM-DD". */
  inicio: IsoDate;
  /** Duração em dias. É ENTRADA, não é calculada — igual à planilha. */
  duracao: number;
  /** Quantidade planejada. `null` = ainda não medida. */
  quantidade: number | null;
  unidade: string | null;
  /** Quantidade já executada, somada da aba PRODUCAO. */
  executado: number;
};

/** Uma linha da grade, com as cinco colunas derivadas. */
export type LinhaDoCronograma = EntradaDaLinha & {
  fim: IsoDate;
  /** `quantidade / duracao`. `null` quando não há o que dividir. */
  produtividade: number | null;
  pctPlanejado: number;
  pctReal: number;
  status: StatusDaLinha;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Converte um dia corrido em "YYYY-MM". É o rótulo de coluna do Gantt da
 * planilha (`01/26`, `02/26`…), e o mesmo corte serve para a Linha de Balanço
 * quando ela troca mês por semana.
 */
export function mesDe(iso: IsoDate): string {
  return iso.slice(0, 7);
}

/** Meses que a atividade ocupa, do início ao fim, inclusive. */
export function mesesOcupados(inicio: IsoDate, fim: IsoDate): string[] {
  const meses: string[] = [];
  let ano = Number(inicio.slice(0, 4));
  let mes = Number(inicio.slice(5, 7));
  const fimAno = Number(fim.slice(0, 4));
  const fimMes = Number(fim.slice(5, 7));
  // Fim antes do início é dado invertido, não atividade que ocupa quase dois
  // séculos. Devolve vazio em vez de varrer a guarda inteira de meses.
  if (fimAno < ano || (fimAno === ano && fimMes < mes)) return [];
  // Guarda de laço: um `inicio` invertido não pode girar para sempre.
  for (let i = 0; i < 2400; i += 1) {
    meses.push(`${ano}-${String(mes).padStart(2, "0")}`);
    if (ano === fimAno && mes === fimMes) return meses;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

/**
 * Uma linha da grade, com as cinco colunas da planilha derivadas.
 *
 * `cal` decide o que é "um dia". Com `CALENDARIO_CORRIDO` o resultado é
 * idêntico ao `=E+G-1` da planilha; com o calendário da obra, o `+1` passa a
 * contar só dias úteis.
 */
export function linhaDoCronograma(
  cal: WorkCalendar,
  hoje: IsoDate,
  e: EntradaDaLinha
): LinhaDoCronograma {
  const duracao = Number.isFinite(e.duracao) ? Math.trunc(e.duracao) : 0;

  // `=E+G-1`: o fim é o dia de índice `duracao - 1`, porque o dia 0 é o início.
  const fim = duracao > 0 ? dateAt(cal, e.inicio, duracao - 1) : e.inicio;

  // `=IF(G>0,H/G,0)` — só existe produtividade se há quantidade e há duração.
  const produtividade =
    duracao > 0 && e.quantidade != null && e.quantidade > 0
      ? e.quantidade / duracao
      : null;

  // `=IF(G>0,MAX(0,MIN(1,(HOJE-E+1)/G)),0)` — o `+1` conta o próprio dia do
  // início como já decorrido, que é o que a planilha faz.
  // `indexOf` devolve 0 quando `hoje` é ANTERIOR a `inicio` — o laço de
  // `elapsedWorkingDays` nunca entra. Sem esta guarda, atividade que nem
  // começou exibia 1/duração de avanço planejado.
  let pctPlanejado = 0;
  if (duracao > 0 && hoje >= e.inicio) {
    const decorridos = indexOf(cal, e.inicio, hoje) + 1;
    pctPlanejado = clamp01(decorridos / duracao);
  }

  // `=IF(H>0,SUMIF(PRODUCAO!$B:$B,A5,PRODUCAO!$C:$C)/H,0)`
  const pctReal =
    e.quantidade != null && e.quantidade > 0
      ? clamp01(e.executado / e.quantidade)
      : 0;

  // `=IF(L>=1,"Concluido",IF(L>0,"Em andamento",IF(HOJE>F,"Atrasado","Nao iniciado")))`
  // Note a ordem: a quantidade manda sobre a data. Uma atividade atrasada que
  // já chegou a 100% é "Concluido", não "Atrasado" — é o que a planilha decide.
  const status: StatusDaLinha =
    duracao <= 0
      ? "Nao iniciado"
      : pctReal >= 1
        ? "Concluido"
        : pctReal > 0
          ? "Em andamento"
          : hoje > fim
            ? "Atrasado"
            : "Nao iniciado";

  return {
    ...e,
    duracao,
    fim,
    produtividade,
    pctPlanejado,
    pctReal,
    status,
  };
}

/** As linhas da grade, já ordenadas como a planilha ordena (por código). */
export function gradeDoCronograma(
  cal: WorkCalendar,
  hoje: IsoDate,
  entradas: EntradaDaLinha[]
): LinhaDoCronograma[] {
  return entradas
    .map(e => linhaDoCronograma(cal, hoje, e))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR"));
}

export type AgregadoDoCronograma = {
  /** Avanço físico ponderado por quantidade, 0..1. */
  avancoFisico: number;
  /** Avanço planejado ponderado por quantidade, 0..1. */
  avancoPlanejado: number;
  /** `avancoFisico - avancoPlanejado`. Negativo = atrasado. */
  desvio: number;
  contagemPorStatus: Record<StatusDaLinha, number>;
  /** Quantas linhas entraram na média ponderada. */
  linhasPonderadas: number;
  linhasSemQuantidade: number;
  totalAtividades: number;
  inicio: IsoDate | null;
  fim: IsoDate | null;
  /** Prazo total em dias, do primeiro início ao último fim. */
  prazoDias: number | null;
};

/**
 * O painel. A planilha escreve `=AVERAGE(CRONOGRAMA!L5:L18)` e rotula
 * "média ponderada" — e não pondera nada. Isso não se reproduz aqui: média
 * simples entre atividades trata uma tarefa de 15 dias igual a uma de 150, e
 * o "avanço físico" do painel deixa de corresponder a qualquer coisa real. Aqui
 * a média é ponderada pela quantidade planejada, que é a única unidade que
 * significa algo entre atividades de unidades diferentes.
 *
 * Atividade sem quantidade fica fora da média e é contada à parte, para o painel
 * poder dizer que elas existem em vez de diluí-las com peso zero.
 */
export function agregadoDoCronograma(
  linhas: LinhaDoCronograma[]
): AgregadoDoCronograma {
  const contagemPorStatus: Record<StatusDaLinha, number> = {
    Concluido: 0,
    "Em andamento": 0,
    Atrasado: 0,
    "Nao iniciado": 0,
  };

  let peso = 0;
  let somaReal = 0;
  let somaPlanejado = 0;
  let linhasPonderadas = 0;
  let semQuantidade = 0;
  let inicio: IsoDate | null = null;
  let fim: IsoDate | null = null;

  for (const l of linhas) {
    contagemPorStatus[l.status] += 1;
    if (inicio === null || l.inicio < inicio) inicio = l.inicio;
    if (fim === null || l.fim > fim) fim = l.fim;

    if (l.quantidade == null || l.quantidade <= 0) {
      semQuantidade += 1;
      continue;
    }
    peso += l.quantidade;
    somaReal += l.quantidade * l.pctReal;
    somaPlanejado += l.quantidade * l.pctPlanejado;
    linhasPonderadas += 1;
  }

  const avancoFisico = peso > 0 ? somaReal / peso : 0;
  const avancoPlanejado = peso > 0 ? somaPlanejado / peso : 0;

  return {
    avancoFisico,
    avancoPlanejado,
    desvio: avancoFisico - avancoPlanejado,
    contagemPorStatus,
    linhasPonderadas,
    linhasSemQuantidade: semQuantidade,
    totalAtividades: linhas.length,
    inicio,
    fim,
    prazoDias:
      inicio && fim && fim >= inicio
        ? indexOf(CALENDARIO_CORRIDO, inicio, fim) + 1
        : null,
  };
}
