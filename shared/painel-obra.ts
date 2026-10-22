/**
 * Regras do painel da obra.
 *
 * Tudo aqui é puro: entra número já calculado, sai situação, rótulo e alerta.
 * A tela não decide nada sozinha.
 *
 * O motivo de existir: o painel antigo mostrava "avanço 19,6%", "planejado
 * 67,4%" e "concluído 18,9%" sem dizer que eram três réguas diferentes — uma
 * ponderada por quantidade, outra por tempo decorrido, outra por contagem de
 * atividades. O engenheiro lia como erro de conta. Aqui cada número carrega o
 * nome da sua régua e o desvio é sempre `real - planejado`, em pontos
 * percentuais, com sinal.
 */

export type IsoDate = string;

const DIA_MS = 86_400_000;

export type SituacaoDaObra =
  | "sem_plano"
  | "nao_iniciada"
  | "em_curso"
  | "atrasada"
  | "concluida";

export type PrazoDoPainel = {
  inicio: IsoDate | null;
  fim: IsoDate | null;
  /** Dias de calendário até o fim. Negativo = venceu. `null` sem plano. */
  diasRestantes: number | null;
  situacao: SituacaoDaObra;
  /** Texto pronto para a tela: "Faltam 41 dias", "Venceu há 8 dias"... */
  rotulo: string;
  /** Onde "hoje" cai na barra de prazo, 0..1. */
  fracaoDecorrida: number;
};

export type FisicoDoPainel = {
  /** 0..1, ponderado pela quantidade planejada. */
  real: number;
  planejado: number;
  /** `real - planejado`, em pontos percentuais (-47,8 = 47,8 p.p. atrás). */
  pontos: number;
  rotulo: "atrasada" | "adiantada" | "no prazo";
};

export type ValorDoPainel = {
  /** Orçamento inteiro da versão ativa. */
  total: number;
  /** Parte do orçamento que está presa a alguma atividade. */
  distribuido: number;
  /** Valor das atividades concluídas, na proporção do avanço de cada uma. */
  executado: number;
  /** Orçamento sem atividade: não entra em curva, nem em avanço por valor. */
  semAtividade: number;
  /** 0..1 do orçamento total. `null` quando não há orçamento. */
  pctExecutado: number | null;
  /** 0..1 do orçamento que chegou às atividades. */
  pctDistribuido: number;
};

export type StatusDasAtividades = {
  total: number;
  concluidas: number;
  emAndamento: number;
  atrasadas: number;
  naoIniciadas: number;
};

export type NivelDeAlerta = "critico" | "atencao" | "info";

export type AlertaDoPainel = {
  id: string;
  nivel: NivelDeAlerta;
  titulo: string;
  detalhe: string;
  /** Aba que resolve o assunto, no id usado pela navegação. */
  aba?: string;
  acao?: string;
};

export type ResumoDoPainel = {
  prazo: PrazoDoPainel;
  fisico: FisicoDoPainel;
  valor: ValorDoPainel;
  status: StatusDasAtividades;
  alertas: AlertaDoPainel[];
  /** Selo do topo: cor e texto. */
  selo: { tipo: SituacaoDaObra | "atencao"; rotulo: string };
};

function limitar01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Meia-noite UTC da data. `null` se o texto não for `AAAA-MM-DD`. */
function meiaNoiteUtc(iso: IsoDate | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

/**
 * Dias de calendário entre duas datas. Compara dia com dia, nunca hora: usar
 * `new Date(iso)` em fuso -3 devolve o dia anterior e o painel passa a dizer
 * que a obra vence um dia antes.
 */
export function diasEntre(
  de: IsoDate | null | undefined,
  ate: IsoDate | null | undefined
): number | null {
  const a = meiaNoiteUtc(de);
  const b = meiaNoiteUtc(ate);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DIA_MS);
}

function contarDias(n: number): string {
  const inteiro = Math.abs(Math.round(n));
  return `${inteiro} ${inteiro === 1 ? "dia" : "dias"}`;
}

/** Situação do prazo a partir do avanço real (0..1) e das datas do plano. */
export function situacaoEPrazo(entrada: {
  hoje: IsoDate;
  inicio: IsoDate | null;
  fim: IsoDate | null;
  real: number;
}): PrazoDoPainel {
  const real = limitar01(entrada.real);
  const { hoje, inicio, fim } = entrada;
  const duracao = diasEntre(inicio, fim);

  if (inicio === null || fim === null || duracao === null || duracao <= 0) {
    return {
      inicio,
      fim,
      diasRestantes: null,
      situacao: "sem_plano",
      rotulo: "Sem prazo definido",
      fracaoDecorrida: 0,
    };
  }

  const restantes = diasEntre(hoje, fim) ?? 0;

  if (real >= 0.999) {
    return {
      inicio,
      fim,
      diasRestantes: restantes,
      situacao: "concluida",
      rotulo: "Obra concluída",
      fracaoDecorrida: 1,
    };
  }

  const decorridos = diasEntre(inicio, hoje) ?? 0;
  const fracaoDecorrida = limitar01(decorridos / duracao);

  if (decorridos < 0) {
    return {
      inicio,
      fim,
      diasRestantes: restantes,
      situacao: "nao_iniciada",
      rotulo: `Começa em ${contarDias(decorridos)}`,
      fracaoDecorrida: 0,
    };
  }

  if (restantes < 0) {
    return {
      inicio,
      fim,
      diasRestantes: restantes,
      situacao: "atrasada",
      rotulo: `Venceu há ${contarDias(restantes)}`,
      fracaoDecorrida,
    };
  }

  if (restantes === 0) {
    return {
      inicio,
      fim,
      diasRestantes: 0,
      situacao: "em_curso",
      rotulo: "Termina hoje",
      fracaoDecorrida,
    };
  }

  return {
    inicio,
    fim,
    diasRestantes: restantes,
    situacao: "em_curso",
    rotulo: `Faltam ${contarDias(restantes)}`,
    fracaoDecorrida,
  };
}

/** Diferença em pontos percentuais, arredondada como a tela mostra. */
export function desvioEmPontos(real: number, planejado: number): number {
  return Math.round((limitar01(real) - limitar01(planejado)) * 1000) / 10;
}

export function rotuloDoDesvio(pontos: number): FisicoDoPainel["rotulo"] {
  if (pontos <= -0.5) return "atrasada";
  if (pontos >= 0.5) return "adiantada";
  return "no prazo";
}

export function avaliarFisico(real: number, planejado: number): FisicoDoPainel {
  const pontos = desvioEmPontos(real, planejado);
  return { real: limitar01(real), planejado: limitar01(planejado), pontos, rotulo: rotuloDoDesvio(pontos) };
}

export function avaliarValor(entrada: {
  total: number;
  distribuido: number;
  executado: number;
}): ValorDoPainel {
  const total = Number.isFinite(entrada.total) ? Math.max(0, entrada.total) : 0;
  const distribuido = Math.min(total, Math.max(0, entrada.distribuido || 0));
  const executado = Math.min(total, Math.max(0, entrada.executado || 0));
  return {
    total,
    distribuido,
    executado,
    semAtividade: Math.max(0, total - distribuido),
    pctExecutado: total > 0 ? executado / total : null,
    pctDistribuido: total > 0 ? distribuido / total : 0,
  };
}

export type EntradaDosAlertas = {
  atrasadas?: number;
  maiorAtrasoDias?: number | null;
  semQuantidade?: number;
  foraDoPlano?: number;
  bloqueadas?: number;
  valorSemAtividade?: number;
  ppc?: number | null;
  atrasoBaselineDias?: number | null;
  riscosAltos?: number;
};

const PESO_DO_NIVEL: Record<NivelDeAlerta, number> = { critico: 0, atencao: 1, info: 2 };

/**
 * Alertas acionáveis, do mais grave para o menos grave.
 *
 * Regra de ouro: só entra o que tem uma aba que resolve. Aviso que não leva a
 * lugar nenhum vira ruído e o engenheiro aprende a ignorar a lista inteira.
 */
export function montarAlertas(entrada: EntradaDosAlertas): AlertaDoPainel[] {
  const lista: AlertaDoPainel[] = [];

  if ((entrada.foraDoPlano ?? 0) > 0) {
    lista.push({
      id: "fora-do-plano",
      nivel: "critico",
      titulo: `${entrada.foraDoPlano} lançamento(s) fora do plano atual`,
      detalhe:
        "Apontam para uma versão antiga do cronograma: o avanço deles não chega às atividades de hoje.",
      aba: "producao",
      acao: "Revisar lançamentos",
    });
  }

  if ((entrada.atrasadas ?? 0) > 0) {
    const maior =
      entrada.maiorAtrasoDias != null && entrada.maiorAtrasoDias > 0
        ? ` Maior atraso: ${contarDias(entrada.maiorAtrasoDias)}.`
        : "";
    lista.push({
      id: "atrasadas",
      nivel: "critico",
      titulo: `${entrada.atrasadas} atividade(s) atrasada(s)`,
      detalhe: `Prazo de fim já passou e o serviço não fechou.${maior}`,
      aba: "gantt",
      acao: "Ver no Gantt",
    });
  }

  if (entrada.atrasoBaselineDias != null && entrada.atrasoBaselineDias > 0) {
    lista.push({
      id: "baseline",
      nivel: "critico",
      titulo: `Prazo ${contarDias(entrada.atrasoBaselineDias)} maior que a baseline`,
      detalhe: "O fim da obra andou para frente desde a baseline aprovada.",
      aba: "baseline",
      acao: "Comparar com a baseline",
    });
  }

  if ((entrada.bloqueadas ?? 0) > 0) {
    lista.push({
      id: "bloqueadas",
      nivel: "atencao",
      titulo: `${entrada.bloqueadas} atividade(s) bloqueada(s) nas próximas semanas`,
      detalhe: "Têm restrição aberta e não começam enquanto ela não for resolvida.",
      aba: "producao",
      acao: "Liberar restrições",
    });
  }

  if ((entrada.valorSemAtividade ?? 0) > 0) {
    lista.push({
      id: "valor-sem-atividade",
      nivel: "atencao",
      titulo: "Orçamento sem atividade",
      detalhe:
        "Parte do valor não está ligada a nenhuma atividade: não aparece na curva nem no avanço por valor.",
      aba: "financeiro",
      acao: "Ligar ao cronograma",
    });
  }

  if (entrada.ppc != null && entrada.ppc < 70) {
    lista.push({
      id: "ppc",
      nivel: "atencao",
      titulo: `PPC da semana em ${Math.round(entrada.ppc)}%`,
      detalhe:
        "Menos de 70% do que foi assumido na semana foi cumprido. O problema costuma estar nas restrições.",
      aba: "producao",
      acao: "Ver compromissos",
    });
  }

  if ((entrada.semQuantidade ?? 0) > 0) {
    lista.push({
      id: "sem-quantidade",
      nivel: "atencao",
      titulo: `${entrada.semQuantidade} atividade(s) sem quantidade`,
      detalhe: "Ficam fora do avanço ponderado: o percentual da obra não as enxerga.",
      aba: "atividades",
      acao: "Completar quantidades",
    });
  }

  if ((entrada.riscosAltos ?? 0) > 0) {
    lista.push({
      id: "riscos",
      nivel: "info",
      titulo: `${entrada.riscosAltos} risco(s) alto(s) em aberto`,
      detalhe: "Riscos sem resposta registrada.",
      aba: "riscos",
      acao: "Ver riscos",
    });
  }

  return lista
    .map((a, i) => ({ a, i }))
    .sort((x, y) => PESO_DO_NIVEL[x.a.nivel] - PESO_DO_NIVEL[y.a.nivel] || x.i - y.i)
    .map(({ a }) => a)
    .slice(0, 6);
}

export function montarResumo(entrada: {
  hoje: IsoDate;
  inicio: IsoDate | null;
  fim: IsoDate | null;
  fisico: { real: number; planejado: number };
  status: StatusDasAtividades;
  valor: { total: number; distribuido: number; executado: number };
  alertas: EntradaDosAlertas;
}): ResumoDoPainel {
  const prazo = situacaoEPrazo({
    hoje: entrada.hoje,
    inicio: entrada.inicio,
    fim: entrada.fim,
    real: entrada.fisico.real,
  });
  const fisico = avaliarFisico(entrada.fisico.real, entrada.fisico.planejado);
  const valor = avaliarValor(entrada.valor);
  const alertas = montarAlertas(entrada.alertas);

  let selo: ResumoDoPainel["selo"];
  if (prazo.situacao === "sem_plano") selo = { tipo: "sem_plano", rotulo: "Sem prazo" };
  else if (prazo.situacao === "concluida") selo = { tipo: "concluida", rotulo: "Concluída" };
  else if (prazo.situacao === "atrasada" || fisico.rotulo === "atrasada")
    selo = { tipo: "atrasada", rotulo: "Atrasada" };
  else if (prazo.situacao === "nao_iniciada") selo = { tipo: "nao_iniciada", rotulo: "Não iniciada" };
  else if (fisico.pontos <= -0.5 || alertas.some((a) => a.nivel === "critico"))
    selo = { tipo: "atencao", rotulo: "Atenção" };
  else selo = { tipo: "em_curso", rotulo: "No prazo" };

  return {
    prazo,
    fisico,
    valor,
    status: entrada.status,
    alertas,
    selo,
  };
}
