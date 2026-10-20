import { describe, expect, it } from "vitest";
import { defaultCalendar } from "../../shared/work-calendar";
import { computeEvm, type EvmActivity, type EvmBudgetItem } from "./evm";

/**
 * O motor de Valor Ganho, numa obra sintética.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * O `projects.evm` devolvia CPI ≈ 1 em qualquer obra, EAC ≈ BAC e VAC ≈ 0.
 * Não era arredondamento: o AC era montado com o PREÇO PLANEJADO
 * (`qtd_real × preço do orçamento`), então o indicador comparava o realizado
 * com ele mesmo e não conseguia acusar estouro. Um indicador que nunca desvia
 * é pior que a ausência dele: ele autoriza a decisão errada com um número no
 * painel.
 *
 * Quatro defeitos viviam no mesmo bloco, e cada um deles tem um teste aqui:
 *
 *   A2  PV em dias CORRIDOS contra `earlyStart` em dias ÚTEIS. O CPM
 *       (`shared/cpm.ts`) opera em índice de dia útil e `routers.ts` converte
 *       a data civil da atividade para esse índice com `calendarIndexOf`.
 *       O EVM media o tempo decorrido com `floor(dias_de_calendário)`, em
 *       outra unidade. Toda obra com fim de semana tinha o SPI superestimado
 *       — em silêncio, porque o número saía plausível.
 *
 *   A3  BAC colhido da versão de orçamento de MAIOR número, sem olhar o
 *       status. Um rascunho virava linha de base. Baseline é um ato de
 *       aprovação: sem ele, o BAC é a última versão que alguém escreveu.
 *
 *   A4  Universos diferentes: o BAC somava TODOS os itens da versão, mas o
 *       denominador do percentual só considerava atividades com
 *       `plannedQuantity > 0`. Itens sem atividade inflavam o BAC sem inflar
 *       o PV — o percentual saía menor que a realidade e o SPI saía maior.
 *
 *   A5  `eac = cpi ? bac/cpi : bac`. Sem vínculo de custo o EAC chutava
 *       `bac`, ou seja, previa conclusão no orçamento. Previsão sem dado não
 *       é otimista, é inventada: o correto é `null`.
 *
 * Mais um, achado durante a correção e não listado na auditoria:
 *
 *   A18 O custo por unidade da atividade era `item.unitPrice / item.quantity`.
 *       O resto do app (o total de `budgets.list` e a curva S do cliente) trata
 *       `unitPrice` como PREÇO UNITÁRIO e a linha como `quantity × unitPrice`.
 *       Dividir o preço unitário pela quantidade sub-orçava a atividade por um
 *       fator igual à quantidade do item — e como o seed usa `vb` com
 *       quantidade 1, o defeito ficou invisível nos dados de exemplo.
 *
 * O QUE ESTE ARQUIVO NÃO PROVA
 *
 * Não prova que o AC vem de despesa real: isso exige a tabela de custo real
 * (Bloco 1b). Aqui o AC continua nascendo do preço planejado — o teste trava a
 * ARITMÉTICA e o UNIVERSO, não a origem do dinheiro. Por isso `costSource` é
 * um campo de saída e não um detalhe de implementação.
 */

/** Segunda-feira. O índice 0 do CPM é o primeiro dia útil >= o início da obra. */
const INICIO_DA_OBRA = "2026-01-05";
/** Sexta-feira da semana seguinte: 11 dias corridos, 9 dias úteis. */
const HOJE = "2026-01-16";

function calendario() {
  return defaultCalendar(2026);
}

/** A: 100 m³, 10 dias úteis, começa no índice 0, custo de R$ 1.000/m³. */
function atividadeA(sobre: Partial<EvmActivity> = {}): EvmActivity {
  return {
    id: 1,
    plannedQuantity: 100,
    durationDays: 10,
    earlyStart: 0,
    startOffset: 0,
    budgetItemId: 1,
    ...sobre,
  };
}

/** B: 50 m³, 5 dias úteis, começa no índice 10, custo de R$ 2.000/m³. */
function atividadeB(sobre: Partial<EvmActivity> = {}): EvmActivity {
  return {
    id: 2,
    plannedQuantity: 50,
    durationDays: 5,
    earlyStart: 10,
    startOffset: 10,
    budgetItemId: 2,
    ...sobre,
  };
}

/** C: atividade com quantidade zerada — não pode entrar no escopo do EVM. */
function atividadeCZerada(): EvmActivity {
  return {
    id: 3,
    plannedQuantity: 0,
    durationDays: 0,
    earlyStart: 0,
    startOffset: 0,
    budgetItemId: null,
  };
}

function itens(): EvmBudgetItem[] {
  return [
    { id: 1, quantity: 100, unitPrice: 1_000 },
    { id: 2, quantity: 50, unitPrice: 2_000 },
    // Existe no orçamento, mas nenhuma atividade do cronograma o consome.
    { id: 3, quantity: 1, unitPrice: 50_000 },
  ];
}

function baseline() {
  return { versionId: 7, versionNumber: 2 };
}

/**
 * 120 m³ executados de 100 m³ planejados. A tem 10 dias e o tempo decorrido é
 * 9 dias úteis: EV nasce de 100% físico × custo da atividade; PV nasce de 90%
 * de tempo × o mesmo custo.
 */
function cenario() {
  return {
    asOfIso: HOJE,
    plannedStartIso: INICIO_DA_OBRA,
    calendar: calendario(),
    baseline: baseline(),
    items: itens(),
    activities: [atividadeA(), atividadeB(), atividadeCZerada()],
    actualByActivity: new Map([[1, 120]]),
  };
}

describe("computeEvm — PV em dias úteis (A2)", () => {
  it("mede o tempo decorrido em dias ÚTEIS, não em dias corridos", () => {
    // 11 dias corridos dariam 110% de progresso na A, cortado para 100%.
    // 9 dias úteis dão 90%. A diferença entre os dois é exatamente o bug.
    const resultado = computeEvm(cenario());
    expect(resultado.plannedPct).toBe(45);
  });

  it("desconta feriado do tempo decorrido", () => {
    const comFeriado = calendario();
    comFeriado.exceptions = [
      ...comFeriado.exceptions,
      { date: "2026-01-08", type: "national_holiday", name: "Feriado da obra" },
    ];
    const resultado = computeEvm({ ...cenario(), calendar: comFeriado });

    // 2026-01-08 era uma quinta-feira útil: sai do numerador.
    expect(resultado.plannedPct).toBe(40);
  });

  it("conta como dia útil o dia normalmente parado que o calendário libera", () => {
    const sabadoDeTrabalho = calendario();
    sabadoDeTrabalho.exceptions = [
      ...sabadoDeTrabalho.exceptions,
      { date: "2026-01-10", type: "working", name: "Sábado trabalhado" },
    ];
    const resultado = computeEvm({ ...cenario(), calendar: sabadoDeTrabalho });

    // O sábado 10/01 entra: 10 dias úteis em [05/01, 16/01).
    expect(resultado.plannedPct).toBe(50);
  });

  it("não deixa o progresso planejado passar de 100% nem ficar negativo", () => {
    const cedo = computeEvm({ ...cenario(), asOfIso: "2026-02-13" });
    expect(cedo.plannedPct).toBe(100);

    const antes = computeEvm({ ...cenario(), asOfIso: "2026-01-04" });
    expect(antes.plannedPct).toBe(0);
  });
});

describe("computeEvm — baseline aprovada (A3)", () => {
  it("usa o orçamento da baseline aprovada como BAC", () => {
    const resultado = computeEvm(cenario());
    expect(resultado.baselineStatus).toBe("aprovada");
    expect(resultado.baselineVersionId).toBe(7);
    expect(resultado.bac).toBe(250_000);
  });

  it("sem baseline aprovada, não inventa BAC nem SPI", () => {
    const resultado = computeEvm({ ...cenario(), baseline: null });

    expect(resultado.baselineStatus).toBe("pendente");
    expect(resultado.baselineVersionId).toBeNull();
    expect(resultado.bac).toBe(0);
    expect(resultado.scopeBac).toBe(0);
    expect(resultado.pv).toBe(0);
    expect(resultado.ev).toBe(0);
    expect(resultado.spi).toBeNull();
    expect(resultado.note).toMatch(/aprovada/);
  });

  it("avisa quando a baseline aprovada não tem item", () => {
    const resultado = computeEvm({ ...cenario(), items: [] });
    expect(resultado.bac).toBe(0);
    expect(resultado.note).toMatch(/sem valores/i);
  });
});

describe("computeEvm — universo BAC ↔ atividades (A4)", () => {
  it("separa o que é escopo do cronograma do que é só orçamento", () => {
    const resultado = computeEvm(cenario());

    expect(resultado.bac).toBe(250_000);
    expect(resultado.scopeBac).toBe(200_000);
    expect(resultado.outOfScopeItems).toBe(1);
    expect(resultado.outOfScopeValue).toBe(50_000);
  });

  it("não conta atividade de quantidade zerada no escopo", () => {
    const resultado = computeEvm(cenario());
    // A C nem tem item vinculado; se fosse contada, inflaria o denominador.
    expect(resultado.scopeBac).toBe(200_000);
  });

  it("PV/EV nascem do escopo, não do orçamento inteiro", () => {
    const resultado = computeEvm(cenario());
    // A: 100 × 1.000 × 90% = 90.000. B: 50 × 2.000 × 0% = 0.
    expect(resultado.pv).toBe(90_000);
    expect(resultado.ev).toBe(100_000);
  });

  it("usa o preço UNITÁRIO do item, não preço dividido pela quantidade (A18)", () => {
    const resultado = computeEvm(cenario());
    // Com `unitPrice / quantity` o peso da A seria 100 × 10 = 1.000, não 100.000.
    expect(resultado.scopeBac).toBe(200_000);
  });
});

describe("computeEvm — EAC sem custo é null (A5)", () => {
  it("prevê EAC quando existe custo vinculado", () => {
    const resultado = computeEvm(cenario());

    expect(resultado.acLinked).toBe(true);
    expect(resultado.ac).toBe(120_000);
    expect(resultado.cpi).toBe(0.833);
    expect(resultado.eac).toBe(240_000);
    expect(resultado.vac).toBe(-40_000);
    expect(resultado.etc).toBe(120_000);
  });

  it("não prevê EAC quando nenhuma atividade tem item vinculado", () => {
    const resultado = computeEvm({
      ...cenario(),
      activities: [
        atividadeA({ budgetItemId: null }),
        atividadeB({ budgetItemId: null }),
        atividadeCZerada(),
      ],
    });

    expect(resultado.acLinked).toBe(false);
    expect(resultado.ac).toBeNull();
    expect(resultado.cpi).toBeNull();
    expect(resultado.eac).toBeNull();
    expect(resultado.vac).toBeNull();
    expect(resultado.etc).toBeNull();
    expect(resultado.note).toMatch(/vinculado/);
  });
});

describe("computeEvm — o indicador acusa desvio", () => {
  it("CPI sai de 1 quando a quantidade executada passa do planejado", () => {
    // A executou 120% do planejado: EV = 100.000, AC = 120.000.
    const estourou = computeEvm(cenario());
    expect(estourou.cpi).toBeLessThan(1);
    expect(estourou.eac).toBeGreaterThan(estourou.scopeBac);
    expect(estourou.cv).toBe(-20_000);

    // Executou exatamente o planejado: EV = AC, CPI = 1.
    const noPlano = computeEvm({
      ...cenario(),
      actualByActivity: new Map([[1, 100]]),
    });
    expect(noPlano.cpi).toBe(1);
    expect(noPlano.eac).toBe(noPlano.scopeBac);
  });

  it("limita o EV de uma atividade ao custo planejado dela", () => {
    // 300 m³ executados de 100 planejados: EV não passa do orçado da atividade.
    const resultado = computeEvm({
      ...cenario(),
      actualByActivity: new Map([[1, 300]]),
    });

    expect(resultado.ev).toBe(100_000);
    expect(resultado.ac).toBe(300_000);
    expect(resultado.cpi).toBe(0.333);
  });

  it("declara de onde vem o custo, em vez de esconder a origem", () => {
    expect(computeEvm(cenario()).costSource).toBe("preco_planejado");
  });
});
