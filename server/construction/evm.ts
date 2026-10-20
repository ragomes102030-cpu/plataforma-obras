import {
  elapsedWorkingDays,
  type IsoDate,
  type WorkCalendar,
} from "../../shared/work-calendar";

/**
 * Valor Ganho (EVM) — o cálculo puro.
 *
 * POR QUE ESTA FUNÇÃO ESTÁ FORA DO ROUTER
 *
 * O EVM vivia dentro do corpo de `projects.evm`, e é um cálculo: dados de
 * entrada, números de saída, nenhuma decisão de banco. Preso ao router ele não
 * podia ser exercitado sem um PostgreSQL de pé, e é exatamente por isso que
 * ficou CPI ≈ 1, EAC ≈ BAC e VAC ≈ 0 por tempo suficiente para ninguém
 * desconfiar. Um cálculo que não tem teste de mesa é um número que ninguém
 * conferiu.
 *
 * A regra que este módulo obedece:
 *
 *   PV/EV/AC falam a MESMA língua de tempo. O CPM (`shared/cpm.ts`) opera em
 *   índice de dia útil e o router converte a data civil da atividade para esse
 *   índice com `calendarIndexOf` (de `shared/work-calendar`). O EVM mede o
 *   tempo decorrido com `elapsedWorkingDays`, a MESMA função — não com
 *   `floor(dias_de_calendário)`, que era a unidade errada e superestimava o
 *   SPI de toda obra com fim de semana.
 *
 *   PV/EV nascem do escopo do cronograma, não do orçamento inteiro. Itens sem
 *   atividade (ou de atividade com quantidade zerada) ficam de fora do BAC do
 *   EVM e são reportados em `outOfScope*` — um BAC maior que o escopo medido
 *   abaixa o percentual e infla o SPI sem que nada esteja errado na obra.
 *
 *   O custo por unidade da atividade é o PREÇO UNITÁRIO do item. Não é
 *   `unitPrice / quantity`: o resto do app (o total de `budgets.list`, a curva
 *   S do cliente) trata a linha como `quantity × unitPrice`, ou seja,
 *   `unitPrice` já é o preço de uma unidade.
 *
 *   AC continua nascendo do preço planejado até existir a tabela de custo real
 *   (Bloco 1b). Enquanto isso o campo `costSource` diz a origem em vez de
 *   deixá-la implícita — e o EAC só é calculado quando há custo vinculado.
 */

export type EvmBudgetItem = {
  id: number;
  quantity: number;
  unitPrice: number;
};

export type EvmActivity = {
  id: number;
  plannedQuantity: number;
  durationDays: number;
  /** Índice de dia útil do CPM em que a atividade começa no mais cedo. */
  earlyStart: number | null;
  startOffset: number | null;
  budgetItemId: number | null;
};

/** A versão de orçamento que define a baseline. Só chega aqui se aprovada. */
export type EvmBaseline = { versionId: number; versionNumber: number } | null;

export type EvmInput = {
  asOfIso: IsoDate;
  plannedStartIso: IsoDate;
  calendar: WorkCalendar;
  baseline: EvmBaseline;
  items: EvmBudgetItem[];
  activities: EvmActivity[];
  /** Quantidade executada e confirmada, por atividade. */
  actualByActivity: ReadonlyMap<number, number>;
};

export type EvmResult = {
  baselineStatus: "aprovada" | "pendente";
  baselineVersionId: number | null;
  /** Total do orçamento da baseline, incluindo o que está fora do cronograma. */
  bac: number;
  /** BAC do EVM: custo planejado do escopo que o cronograma mede. */
  scopeBac: number;
  outOfScopeItems: number;
  outOfScopeValue: number;
  pv: number;
  ev: number;
  ac: number | null;
  spi: number | null;
  cpi: number | null;
  sv: number;
  cv: number | null;
  eac: number | null;
  vac: number | null;
  etc: number | null;
  plannedPct: number;
  actualPct: number;
  acLinked: boolean;
  /** Origem do AC. Diz "planejado" até o custo real existir. */
  costSource: "preco_planejado" | "custo_real";
  note: string | null;
};

const dinheiro = (valor: number): number => Math.round(valor * 100) / 100;
const taxa = (valor: number): number => Math.round(valor * 1000) / 1000;
const percentual = (valor: number): number => Math.round(valor * 10) / 10;

const limitado = (valor: number, minimo: number, maximo: number): number =>
  Math.max(minimo, Math.min(maximo, valor));

export function computeEvm(input: EvmInput): EvmResult {
  const { baseline, items, activities, actualByActivity } = input;

  // BAC É a baseline. Sem versão aprovada não existe BAC — e não é o caso de
  // somar os itens que o chamador passou, porque esses itens pertencem a uma
  // versão que ninguém aprovou. Zerar aqui é o que impede um chamador
  // descuidado de transformar rascunho em linha de base.
  const totalDoOrcamento = baseline
    ? items.reduce((soma, item) => soma + item.quantity * item.unitPrice, 0)
    : 0;

  const vazio: EvmResult = {
    baselineStatus: baseline ? "aprovada" : "pendente",
    baselineVersionId: baseline?.versionId ?? null,
    bac: dinheiro(totalDoOrcamento),
    scopeBac: 0,
    outOfScopeItems: baseline ? items.length : 0,
    outOfScopeValue: dinheiro(totalDoOrcamento),
    pv: 0,
    ev: 0,
    ac: null,
    spi: null,
    cpi: null,
    sv: 0,
    cv: null,
    eac: null,
    vac: null,
    etc: null,
    plannedPct: 0,
    actualPct: 0,
    acLinked: false,
    costSource: "preco_planejado",
    note: null,
  };

  // Sem baseline aprovada não há BAC: baseline é um ato de aprovação, não a
  // última versão que alguém escreveu. Inventar BAC aqui foi o defeito A3.
  if (!baseline) {
    return {
      ...vazio,
      note:
        "Nenhuma versão de orçamento aprovada — aprove uma versão para definir a linha de base (BAC).",
    };
  }

  if (totalDoOrcamento <= 0) {
    return {
      ...vazio,
      note:
        "Baseline aprovada sem valores — cadastre itens no orçamento para medir o escopo.",
    };
  }

  const itemPorId = new Map(items.map(item => [item.id, item]));
  // Mesma unidade de tempo do CPM: dias úteis a partir do início da obra.
  const tempoDecorrido = elapsedWorkingDays(
    input.calendar,
    input.plannedStartIso,
    input.asOfIso
  );

  const escopo = new Set<number>();
  let scopeBac = 0;
  let pv = 0;
  let ev = 0;
  let ac = 0;
  let acLinked = false;

  for (const atividade of activities) {
    const planejado = atividade.plannedQuantity;
    if (planejado <= 0) continue;
    const item =
      atividade.budgetItemId == null
        ? null
        : itemPorId.get(atividade.budgetItemId);
    if (!item || item.quantity <= 0) continue;

    escopo.add(item.id);
    const peso = planejado * item.unitPrice;
    scopeBac += peso;

    const inicio = atividade.earlyStart ?? atividade.startOffset ?? 0;
    // Tempo em dia útil ÷ duração em dia útil. As duas pontas na mesma régua.
    const progressoPlanejado = limitado(
      (tempoDecorrido - inicio) / Math.max(1, atividade.durationDays),
      0,
      1
    );
    const executado = actualByActivity.get(atividade.id) ?? 0;
    const progressoReal = limitado(executado / planejado, 0, 1);

    pv += peso * progressoPlanejado;
    ev += peso * progressoReal;
    ac += executado * item.unitPrice;
    acLinked = true;
  }

  const foraDoEscopo = items.filter(item => !escopo.has(item.id));
  const valorForaDoEscopo = foraDoEscopo.reduce(
    (soma, item) => soma + item.quantity * item.unitPrice,
    0
  );

  const spi = pv > 0 ? ev / pv : null;
  // AC é o custo do que foi executado. Sem item vinculado não existe AC, sem
  // AC não existe CPI — e sem CPI não existe previsão (defeito A5: o código
  // previa `bac` no lugar do EAC, ou seja, inventava a conclusão no orçamento).
  const cpi = acLinked && ac > 0 ? ev / ac : null;
  const sv = ev - pv;
  const cv = acLinked ? ev - ac : null;
  // `cpi` sem arredondar: arredondar antes dividir BAC por 0,833 daria
  // 240.096 em vez de 240.000, e o erro entraria disfarçado de precisão.
  const eac = cpi && cpi > 0 ? scopeBac / cpi : null;
  const vac = eac === null ? null : scopeBac - eac;
  const etc = eac === null ? null : eac - (acLinked ? ac : ev);

  return {
    baselineStatus: "aprovada",
    baselineVersionId: baseline.versionId,
    bac: dinheiro(totalDoOrcamento),
    scopeBac: dinheiro(scopeBac),
    outOfScopeItems: foraDoEscopo.length,
    outOfScopeValue: dinheiro(valorForaDoEscopo),
    pv: dinheiro(pv),
    ev: dinheiro(ev),
    ac: acLinked ? dinheiro(ac) : null,
    spi: spi === null ? null : taxa(spi),
    cpi: cpi === null ? null : taxa(cpi),
    sv: dinheiro(sv),
    cv: cv === null ? null : dinheiro(cv),
    eac: eac === null ? null : dinheiro(eac),
    vac: vac === null ? null : dinheiro(vac),
    etc: etc === null ? null : dinheiro(etc),
    plannedPct: percentual((scopeBac > 0 ? pv / scopeBac : 0) * 100),
    actualPct: percentual((scopeBac > 0 ? ev / scopeBac : 0) * 100),
    acLinked,
    costSource: "preco_planejado",
    note: acLinked
      ? null
      : "CPI/EAC sem custos vinculados às atividades — vincule um item de orçamento para estimar.",
  };
}
