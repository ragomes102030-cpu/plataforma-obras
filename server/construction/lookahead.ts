/**
 * Lookahead de 4 semanas e PPC — o núcleo do Last Planner.
 *
 * Duas perguntas que o Gantt não responde e a obra faz toda segunda-feira:
 *
 *   1. **O que vai acontecer nas próximas 4 semanas e o que ainda trava?**
 *      (`semanas[].atividades`, com `pronta` = sem restrição aberta)
 *   2. **A semana passada cumpriu o que prometeu?** (`ppc`, em %)
 *
 * Regras que existem para o número não mentir:
 *
 *   - PPC só é calculado sobre compromissos **avaliados** (`concluido` ou
 *     `nao_concluido`). Semana em andamento com tudo `planejado` devolve `null`,
 *     nunca 0% — zero por "ainda não aconteceu" é ruído, não informação.
 *   - `cancelado` sai da conta: não foi compromisso, foi desistência. Some da
 *     base mas não vira falha.
 *   - `pendentes` sempre acompanha o PPC. Um PPC de 100% com 12 pendentes é um
 *     PPC de 2 avaliações, e isso precisa estar visível.
 *   - Atividade com restrição `aberta`/`em_andamento` não é "pronta" — mesmo que
 *     a barra do Gantt já tenha começado. É a diferença entre planejado e
 *     executável.
 *   - Atividade 100% executada não entra no lookahead: já não é futuro.
 *
 * A semana é segunda a sexta. `weekStart` é sempre segunda-feira, e todo
 * cálculo de data aqui é feito em UTC sobre `YYYY-MM-DD`, sem `Date` local —
 * senão a semana muda de nome dependendo do fuso do navegador.
 */

export type LookaheadReason =
  | "material"
  | "mao_de_obra"
  | "equipamento"
  | "projeto"
  | "permissao"
  | "clima"
  | "cliente"
  | "fornecedor"
  | "retrabalho"
  | "frente_trabalho"
  | "seguranca"
  | "outro";

export type LookaheadCommitmentStatus =
  | "planejado"
  | "concluido"
  | "nao_concluido"
  | "cancelado";

const DIA_MS = 86_400_000;

function paraData(iso: string): Date {
  // Meia-noite UTC: `new Date("2026-01-05")` já é UTC, mas o sufixo explícito
  // impede que um `iso` com hora seja interpretado como local.
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Soma dias de calendário (não úteis). */
export function somarDias(iso: string, dias: number): string {
  return paraIso(new Date(paraData(iso).getTime() + dias * DIA_MS));
}

/** Normaliza qualquer data para a segunda-feira da sua semana. */
export function segundaFeira(iso: string): string {
  const data = paraData(iso);
  // getUTCDay: 0 = domingo ... 6 = sábado. Domingo pertence à semana que
  // começou 6 dias antes.
  const deslocamento = (data.getUTCDay() + 6) % 7;
  return somarDias(iso, -deslocamento);
}

export function diasEntre(inicioIso: string, fimIso: string): number {
  return Math.round((paraData(fimIso).getTime() - paraData(inicioIso).getTime()) / DIA_MS);
}

export type LookaheadActivity = {
  id: number;
  wbsCode: string;
  name: string;
  unit: string | null;
  /** Início planejado em data real (já convertido do offset do calendário). */
  startIso: string;
  /** Fim planejado em data real, inclusive. */
  finishIso: string;
  plannedQuantity: number;
  /** Executado acumulado até a data de corte. */
  executedQuantity: number;
  /** Restrições em `aberta`/`em_andamento`. Zero = pronta. */
  openConstraints: number;
};

export type LookaheadCommitment = {
  id: number;
  activityId: number;
  weekStartIso: string;
  status: LookaheadCommitmentStatus;
  reason: LookaheadReason | null;
  plannedQuantity: number | null;
  executedQuantity: number | null;
  responsible: string | null;
};

export type LookaheadInput = {
  atividades: LookaheadActivity[];
  compromissos: LookaheadCommitment[];
  /** Qualquer data; a função normaliza para a segunda-feira. */
  semanaBaseIso: string;
  hojeIso: string;
  /** Quantas semanas a partir da base. Default: 4. */
  semanas?: number;
};

export type AtividadeNaSemana = {
  id: number;
  wbsCode: string;
  name: string;
  unit: string | null;
  startIso: string;
  finishIso: string;
  openConstraints: number;
  pronta: boolean;
  /** Executado / planejado, em %, limitado a 100. `null` se não há quantidade. */
  percentualExecutado: number | null;
  /** Já tem compromisso registrado nesta semana? */
  comprometida: boolean;
};

export type CompromissoNaSemana = {
  id: number;
  activityId: number;
  status: LookaheadCommitmentStatus;
  reason: LookaheadReason | null;
  plannedQuantity: number | null;
  executedQuantity: number | null;
  responsible: string | null;
  avaliado: boolean;
};

export type CausaDeNaoCumprimento = {
  reason: LookaheadReason;
  quantidade: number;
  /** Participação nas não conformidades da semana, em %. */
  participacao: number;
};

export type SemanaLookahead = {
  numero: number;
  inicio: string;
  fim: string;
  situacao: "encerrada" | "corrente" | "futura";
  atividades: AtividadeNaSemana[];
  prontas: number;
  bloqueadas: number;
  compromissos: CompromissoNaSemana[];
  concluidos: number;
  naoConcluidos: number;
  pendentes: number;
  /** % de compromissos avaliados que foram cumpridos. `null` se nada avaliado. */
  ppc: number | null;
  /** % executado / planejado em quantidade, só sobre o que tem as duas pontas. */
  ppcQuantidade: number | null;
  causas: CausaDeNaoCumprimento[];
};

export type LookaheadResult = {
  semanaBase: string;
  hojeIso: string;
  semanas: SemanaLookahead[];
  /** Média do PPC das semanas já encerradas que têm medição. */
  ppcMedio: number | null;
  /** PPC da semana corrente (pode ser parcial). */
  ppcCorrente: number | null;
  tendencia: "subindo" | "caindo" | "estavel" | "sem_dados";
  totalAtividades: number;
  totalBloqueadas: number;
  compromissosPendentes: number;
  alertas: string[];
};

const MOTIVOS: LookaheadReason[] = [
  "material",
  "mao_de_obra",
  "equipamento",
  "projeto",
  "permissao",
  "clima",
  "cliente",
  "fornecedor",
  "retrabalho",
  "frente_trabalho",
  "seguranca",
  "outro",
];

function arredondar(valor: number, casas = 1): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function percentual(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return arredondar((parte / total) * 100);
}

/** A atividade conflita com a janela [inicio, fim]? Datas inclusivas. */
function sobrepoe(atividade: LookaheadActivity, inicio: string, fim: string): boolean {
  return atividade.startIso <= fim && atividade.finishIso >= inicio;
}

function estaConcluida(atividade: LookaheadActivity): boolean {
  return (
    atividade.plannedQuantity > 0 &&
    atividade.executedQuantity >= atividade.plannedQuantity
  );
}

function percentualExecutado(atividade: LookaheadActivity): number | null {
  if (atividade.plannedQuantity <= 0) return null;
  return arredondar(
    Math.min(100, (atividade.executedQuantity / atividade.plannedQuantity) * 100)
  );
}

export function computeLookahead(input: LookaheadInput): LookaheadResult {
  const quantidadeSemanas = Math.max(1, Math.min(12, input.semanas ?? 4));
  const semanaBase = segundaFeira(input.semanaBaseIso);
  const hoje = input.hojeIso.slice(0, 10);

  const porAtividade = new Map<number, LookaheadActivity>();
  for (const atividade of input.atividades) porAtividade.set(atividade.id, atividade);

  const semanas: SemanaLookahead[] = [];

  for (let indice = 0; indice < quantidadeSemanas; indice += 1) {
    const inicio = somarDias(semanaBase, indice * 7);
    const fim = somarDias(inicio, 4); // segunda a sexta
    const situacao: SemanaLookahead["situacao"] =
      fim < hoje ? "encerrada" : inicio > hoje ? "futura" : "corrente";

    const compromissosDaSemana = input.compromissos
      .filter(
        compromisso =>
          compromisso.weekStartIso === inicio && compromisso.status !== "cancelado"
      )
      .map<CompromissoNaSemana>(compromisso => ({
        id: compromisso.id,
        activityId: compromisso.activityId,
        status: compromisso.status,
        reason: compromisso.reason,
        plannedQuantity: compromisso.plannedQuantity,
        executedQuantity: compromisso.executedQuantity,
        responsible: compromisso.responsible,
        avaliado:
          compromisso.status === "concluido" ||
          compromisso.status === "nao_concluido",
      }));

    const comprometidas = new Set(compromissosDaSemana.map(c => c.activityId));

    const atividades = input.atividades
      .filter(atividade => sobrepoe(atividade, inicio, fim))
      .filter(atividade => !estaConcluida(atividade))
      .sort(
        (a, b) =>
          a.startIso.localeCompare(b.startIso) || a.wbsCode.localeCompare(b.wbsCode)
      )
      .map<AtividadeNaSemana>(atividade => ({
        id: atividade.id,
        wbsCode: atividade.wbsCode,
        name: atividade.name,
        unit: atividade.unit,
        startIso: atividade.startIso,
        finishIso: atividade.finishIso,
        openConstraints: atividade.openConstraints,
        pronta: atividade.openConstraints === 0,
        percentualExecutado: percentualExecutado(atividade),
        comprometida: comprometidas.has(atividade.id),
      }));

    const concluidos = compromissosDaSemana.filter(c => c.status === "concluido").length;
    const naoConcluidos = compromissosDaSemana.filter(
      c => c.status === "nao_concluido"
    ).length;
    const pendentes = compromissosDaSemana.filter(c => c.status === "planejado").length;
    const avaliados = concluidos + naoConcluidos;

    let quantidadePlanejada = 0;
    let quantidadeExecutada = 0;
    for (const compromisso of compromissosDaSemana) {
      if (!compromisso.avaliado) continue;
      if (compromisso.plannedQuantity === null || compromisso.executedQuantity === null) {
        continue;
      }
      if (compromisso.plannedQuantity <= 0) continue;
      quantidadePlanejada += compromisso.plannedQuantity;
      quantidadeExecutada += compromisso.executedQuantity;
    }

    const contagemCausas = new Map<LookaheadReason, number>();
    for (const compromisso of compromissosDaSemana) {
      if (compromisso.status !== "nao_concluido" || !compromisso.reason) continue;
      contagemCausas.set(
        compromisso.reason,
        (contagemCausas.get(compromisso.reason) ?? 0) + 1
      );
    }
    const causas = MOTIVOS.filter(motivo => contagemCausas.has(motivo))
      .map<CausaDeNaoCumprimento>(motivo => ({
        reason: motivo,
        quantidade: contagemCausas.get(motivo) ?? 0,
        participacao: percentual(contagemCausas.get(motivo) ?? 0, naoConcluidos) ?? 0,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    semanas.push({
      numero: indice + 1,
      inicio,
      fim,
      situacao,
      atividades,
      prontas: atividades.filter(a => a.pronta).length,
      bloqueadas: atividades.filter(a => !a.pronta).length,
      compromissos: compromissosDaSemana,
      concluidos,
      naoConcluidos,
      pendentes,
      ppc: percentual(concluidos, avaliados),
      ppcQuantidade: percentual(quantidadeExecutada, quantidadePlanejada),
      causas,
    });
  }

  const encerradasComPpc = semanas.filter(
    semana => semana.situacao === "encerrada" && semana.ppc !== null
  );
  const ppcMedio =
    encerradasComPpc.length > 0
      ? arredondar(
          encerradasComPpc.reduce((soma, semana) => soma + (semana.ppc ?? 0), 0) /
            encerradasComPpc.length
        )
      : null;

  const corrente = semanas.find(semana => semana.situacao === "corrente") ?? null;

  // Tendência: compara as duas últimas semanas encerradas com medição. Abaixo
  // de 5 pontos percentuais a diferença é ruído de amostra pequena (3 de 5
  // compromissos dá 60%, 4 de 5 dá 80% — e isso não é tendência).
  let tendencia: LookaheadResult["tendencia"] = "sem_dados";
  if (encerradasComPpc.length >= 2) {
    const ultima = encerradasComPpc[encerradasComPpc.length - 1]!.ppc ?? 0;
    const penultima = encerradasComPpc[encerradasComPpc.length - 2]!.ppc ?? 0;
    const delta = ultima - penultima;
    tendencia = delta >= 5 ? "subindo" : delta <= -5 ? "caindo" : "estavel";
  }

  const bloqueadasCorrente = corrente ? corrente.bloqueadas : 0;
  const pendentesTotal = semanas.reduce((soma, semana) => soma + semana.pendentes, 0);

  const alertas: string[] = [];
  if (!corrente) {
    alertas.push("Nenhuma semana corrente na janela — confira a data base do lookahead.");
  } else {
    if (corrente.atividades.length === 0) {
      alertas.push(
        "Sem atividade planejada para esta semana: o cronograma pode estar desatualizado."
      );
    }
    if (corrente.compromissos.length === 0) {
      alertas.push(
        "Nenhum compromisso assumido para a semana corrente — sem compromisso não há PPC."
      );
    }
    if (bloqueadasCorrente > 0) {
      alertas.push(
        `${bloqueadasCorrente} atividade(s) da semana corrente com restrição aberta.`
      );
    }
    if (corrente.ppc !== null && corrente.ppc < 60 && corrente.pendentes === 0) {
      alertas.push(
        `PPC da semana corrente em ${corrente.ppc}%: mais da metade do que foi assumido não saiu.`
      );
    }
    if (corrente.pendentes > 0) {
      alertas.push(
        `${corrente.pendentes} compromisso(s) da semana corrente ainda sem avaliação.`
      );
    }
  }
  if (pendentesTotal > 0) {
    alertas.push(
      `${pendentesTotal} compromisso(s) na janela sem avaliação — o PPC deles ainda não existe.`
    );
  }

  return {
    semanaBase,
    hojeIso: hoje,
    semanas,
    ppcMedio,
    ppcCorrente: corrente ? corrente.ppc : null,
    tendencia,
    totalAtividades: semanas.reduce((soma, semana) => soma + semana.atividades.length, 0),
    totalBloqueadas: semanas.reduce((soma, semana) => soma + semana.bloqueadas, 0),
    compromissosPendentes: pendentesTotal,
    alertas,
  };
}
