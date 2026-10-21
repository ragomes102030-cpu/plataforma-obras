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
 *   AC É DINHEIRO QUE SAIU — não preço de tabela.
 *
 *     Antes, `ac = quantidade executada × preço unitário`. Como
 *     `ev = peso × progresso` e `progresso = executado / planejado`, os dois
 *     davam o MESMO número: `AC ≡ EV`, logo `CPI = EV/AC ≡ 1,000`, para sempre.
 *     O índice não podia acusar estouro porque numerador e denominador eram o
 *     mesmo dado lido duas vezes. Isso não aparecia como erro — aparecia como
 *     "obra sempre dentro do orçamento".
 *
 *     Agora o AC vem de `cost_entries` (ver `evm-dados.ts`). Sem lançamento de
 *     custo, `ac` é `null` e o CPI/EAC ficam `null` também: um "—" honesto é
 *     melhor que um 1,000 inventado. `custoPlanejadoDoExecutado` continua sendo
 *     devolvido como REFERÊNCIA (é o antigo AC), mas nunca entra em índice.
 *
 *   CPI sobre escopo parcialmente custeado engana. Se só 10% do escopo tem
 *   custo lançado, `EV/AC` compara obra inteira com um décimo do gasto e
 *   devolve um CPI alto que não significa nada. Por isso `costCoveragePct` sai
 *   junto, e abaixo de 80% o resultado vem com aviso.
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
  /**
   * Custo real confirmado (competência até `asOf`), por atividade.
   *
   * Opcional para o módulo continuar sendo um cálculo puro: quem chamar sem
   * custo recebe `ac = null`, e não um AC deduzido do orçamento.
   */
  costByActivity?: ReadonlyMap<number, number>;
  /** Custo real confirmado, por item de orçamento (nota de material). */
  costByItem?: ReadonlyMap<number, number>;
  /** Custo real sem vínculo (mobilização, canteiro). Fora do CPI. */
  costUnallocated?: number;
  /** Quantos lançamentos de custo entraram, para o painel explicar o "—". */
  costEntryCount?: number;
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
  /** Custo real do escopo medido. `null` quando não há custo lançado. */
  ac: number | null;
  /** Custo real de itens fora do escopo. Não entra no CPI. */
  acOutOfScope: number;
  /** Custo sem atividade nem item. Não entra no CPI. */
  acUnallocated: number;
  /** `ac + acOutOfScope + acUnallocated`: todo o dinheiro lançado no projeto. */
  acTotal: number;
  /** % do peso do escopo que tem ao menos um lançamento de custo. */
  costCoveragePct: number;
  costEntryCount: number;
  /** O antigo AC (preço planejado do executado). Referência, não índice. */
  custoPlanejadoDoExecutado: number;
  spi: number | null;
  cpi: number | null;
  tcpi: number | null;
  sv: number;
  cv: number | null;
  eac: number | null;
  vac: number | null;
  etc: number | null;
  plannedPct: number;
  actualPct: number;
  /** `true` só quando existe custo real; antes significava "tem item". */
  acLinked: boolean;
  /** Origem do AC. Deixou de existir "preço planejado" como origem. */
  costSource: "custo_real" | "sem_custo";
  note: string | null;
};

const dinheiro = (valor: number): number => Math.round(valor * 100) / 100;
const taxa = (valor: number): number => Math.round(valor * 1000) / 1000;
const percentual = (valor: number): number => Math.round(valor * 10) / 10;

const limitado = (valor: number, minimo: number, maximo: number): number =>
  Math.max(minimo, Math.min(maximo, valor));

const somarMapa = (mapa: ReadonlyMap<number, number> | undefined): number =>
  mapa ? [...mapa.values()].reduce((soma, valor) => soma + valor, 0) : 0;

export function computeEvm(input: EvmInput): EvmResult {
  const { baseline, items, activities, actualByActivity } = input;
  const costByActivity = input.costByActivity;
  const costByItem = input.costByItem;
  const costUnallocated = input.costUnallocated ?? 0;
  const costEntryCount = input.costEntryCount ?? 0;

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
    acOutOfScope: 0,
    acUnallocated: dinheiro(costUnallocated),
    acTotal: dinheiro(costUnallocated),
    costCoveragePct: 0,
    costEntryCount,
    custoPlanejadoDoExecutado: 0,
    spi: null,
    cpi: null,
    tcpi: null,
    sv: 0,
    cv: null,
    eac: null,
    vac: null,
    etc: null,
    plannedPct: 0,
    actualPct: 0,
    acLinked: false,
    costSource: "sem_custo",
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
  /** Peso de cada item que o cronograma mede, para calcular cobertura. */
  const pesoPorItem = new Map<number, number>();
  let scopeBac = 0;
  let pv = 0;
  let ev = 0;
  let custoPlanejadoDoExecutado = 0;
  let acNoEscopo = 0;
  let acAtividadesNoEscopo = 0;

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
    pesoPorItem.set(item.id, (pesoPorItem.get(item.id) ?? 0) + peso);

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
    // Referência apenas: é exatamente o EV, e era este número que fazia o CPI
    // valer 1,000 quando ocupava o lugar do AC.
    custoPlanejadoDoExecutado += executado * item.unitPrice;

    const custoDaAtividade = costByActivity?.get(atividade.id) ?? 0;
    acAtividadesNoEscopo += custoDaAtividade;
    acNoEscopo += custoDaAtividade;
  }

  // Custo lançado por item (nota de material que atende várias atividades).
  // Só entra o que pertence a um item do escopo.
  let acItensNoEscopo = 0;
  for (const [itemId, valor] of costByItem ?? []) {
    if (escopo.has(itemId)) {
      acNoEscopo += valor;
      acItensNoEscopo += valor;
    }
  }

  const foraDoEscopo = items.filter(item => !escopo.has(item.id));
  const valorForaDoEscopo = foraDoEscopo.reduce(
    (soma, item) => soma + item.quantity * item.unitPrice,
    0
  );

  // Tudo o que foi lançado e NÃO é do escopo medido. Reportado, não somado ao
  // CPI: custo administrativo grande não deve "melhorar" o índice.
  const acForaDoEscopo =
    somarMapa(costByActivity) -
    acAtividadesNoEscopo +
    (somarMapa(costByItem) - acItensNoEscopo);

  const ac = acNoEscopo > 0 ? acNoEscopo : null;
  const acTotal = acNoEscopo + acForaDoEscopo + costUnallocated;

  // Cobertura: quanto do PESO do escopo tem algum custo lançado, seja por
  // atividade daquele item, seja por lançamento direto no item.
  const itensComCusto = new Set<number>();
  for (const atividade of activities) {
    if (atividade.budgetItemId == null) continue;
    const temCusto = (costByActivity?.get(atividade.id) ?? 0) > 0;
    if (temCusto) itensComCusto.add(atividade.budgetItemId);
  }
  for (const itemId of costByItem?.keys() ?? []) itensComCusto.add(itemId);
  let pesoCoberto = 0;
  for (const [itemId, peso] of pesoPorItem) {
    if (itensComCusto.has(itemId)) pesoCoberto += peso;
  }
  const costCoveragePct = scopeBac > 0 ? (pesoCoberto / scopeBac) * 100 : 0;

  const spi = pv > 0 ? ev / pv : null;
  // Sem AC não existe CPI — e sem CPI não existe previsão (defeito A5: o código
  // previa `bac` no lugar do EAC, ou seja, inventava a conclusão no orçamento).
  const cpi = ac !== null && ac > 0 ? ev / ac : null;
  const sv = ev - pv;
  const cv = ac !== null ? ev - ac : null;
  // `cpi` sem arredondar: arredondar antes dividir BAC por 0,833 daria
  // 240.096 em vez de 240.000, e o erro entraria disfarçado de precisão.
  const eac = cpi && cpi > 0 ? scopeBac / cpi : null;
  const vac = eac === null ? null : scopeBac - eac;
  const etc = eac === null || ac === null ? null : eac - ac;
  // TCPI: desempenho de custo necessário para terminar no BAC.
  const tcpi =
    ac !== null && scopeBac - ac > 0 ? (scopeBac - ev) / (scopeBac - ac) : null;

  const avisos: string[] = [];
  if (ac === null) {
    avisos.push(
      costEntryCount > 0
        ? "Há lançamentos de custo, mas nenhum vinculado ao escopo medido — o CPI não pode ser calculado."
        : "Nenhum custo real lançado — CPI, EAC e VAC ficam indisponíveis até existir lançamento."
    );
  } else if (costCoveragePct < 80) {
    avisos.push(
      `CPI calculado sobre ${percentual(costCoveragePct)}% do escopo com custo lançado — pode estar otimista.`
    );
  }
  if (costUnallocated > 0) {
    avisos.push(
      `${dinheiro(costUnallocated).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em custos sem vínculo (não entram no CPI).`
    );
  }

  return {
    baselineStatus: "aprovada",
    baselineVersionId: baseline.versionId,
    bac: dinheiro(totalDoOrcamento),
    scopeBac: dinheiro(scopeBac),
    outOfScopeItems: foraDoEscopo.length,
    outOfScopeValue: dinheiro(valorForaDoEscopo),
    pv: dinheiro(pv),
    ev: dinheiro(ev),
    ac: ac === null ? null : dinheiro(ac),
    acOutOfScope: dinheiro(acForaDoEscopo),
    acUnallocated: dinheiro(costUnallocated),
    acTotal: dinheiro(acTotal),
    costCoveragePct: percentual(costCoveragePct),
    costEntryCount,
    custoPlanejadoDoExecutado: dinheiro(custoPlanejadoDoExecutado),
    spi: spi === null ? null : taxa(spi),
    cpi: cpi === null ? null : taxa(cpi),
    tcpi: tcpi === null ? null : taxa(tcpi),
    sv: dinheiro(sv),
    cv: cv === null ? null : dinheiro(cv),
    eac: eac === null ? null : dinheiro(eac),
    vac: vac === null ? null : dinheiro(vac),
    etc: etc === null ? null : dinheiro(etc),
    plannedPct: percentual((scopeBac > 0 ? pv / scopeBac : 0) * 100),
    actualPct: percentual((scopeBac > 0 ? ev / scopeBac : 0) * 100),
    acLinked: ac !== null,
    costSource: ac !== null ? "custo_real" : "sem_custo",
    note: avisos.length > 0 ? avisos.join(" ") : null,
  };
}
