import { describe, expect, it } from "vitest";
import {
  CALENDARIO_CORRIDO,
  agregadoDoCronograma,
  gradeDoCronograma,
  linhaDoCronograma,
  mesesOcupados,
  type EntradaDaLinha,
} from "./cronograma-colunas";
import { defaultCalendar, type IsoDate } from "./work-calendar";

/**
 * Cada teste aqui é uma fórmula copiada da planilha
 * `Relatorio_Progresso_Obra_PROFISSIONAL.xlsx`, com os mesmos valores de
 * exemplo. Se a fórmula da planilha mudar, o teste muda junto — e o motor
 * diverge da referência na mesma hora, o que é o que este arquivo existe para
 * impedir.
 */

const CAL = CALENDARIO_CORRIDO;

/** A primeira atividade da planilha: `01.01`, 15 dias, quantidade 1 vb. */
const linha01: EntradaDaLinha = {
  codigo: "01.01",
  atividade: "Servicos preliminares e canteiro",
  frente: "EXECUCAO",
  pavimento: "GERAL",
  inicio: "2026-01-05",
  duracao: 15,
  quantidade: 1,
  unidade: "vb",
  executado: 1,
};

/** `02.01`: 25 dias, 3200 m3, executado tudo. */
const linha02: EntradaDaLinha = {
  ...linha01,
  codigo: "02.01",
  atividade: "Escavacao e movimento de terra",
  inicio: "2026-01-20",
  duracao: 25,
  quantidade: 3200,
  unidade: "m3",
  executado: 3200,
};

/** `05.02`: 140 dias, começa em 2026-10-15, nada executado. */
const linha15: EntradaDaLinha = {
  ...linha01,
  codigo: "05.02",
  atividade: "Instalacoes hidraulicas",
  inicio: "2026-10-15",
  duracao: 140,
  quantidade: 14000,
  unidade: "m",
  executado: 0,
};

describe("Fim = Início + Duração − 1", () => {
  it("bate com a planilha em dia corrido", () => {
    // Planilha, 01.01: início 05/01, duração 15, `=E5+G5-1` => 19/01.
    const l = linhaDoCronograma(CAL, "2026-07-15", linha01);
    expect(l.fim).toBe("2026-01-19");
  });

  it("o fim é o próprio início quando a duração é 1", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", { ...linha01, duracao: 1 });
    expect(l.fim).toBe("2026-01-05");
  });

  it("duração zero não anda a data", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", { ...linha01, duracao: 0 });
    expect(l.fim).toBe(linha01.inicio);
  });

  it("com calendário de obra, o fim pula fim de semana", () => {
    // Mesma entrada, agora no calendário brasileiro: 05/01/2026 é segunda.
    // 15 dias úteis terminam antes de 15 dias corridos.
    const cal = defaultCalendar(2026);
    const comUtil = linhaDoCronograma(cal, "2026-07-15", linha01);
    const comCorrido = linhaDoCronograma(CAL, "2026-07-15", linha01);
    expect(comUtil.fim).not.toBe(comCorrido.fim);
    expect(comUtil.fim > comCorrido.fim).toBe(true);
  });
});

describe("Produtividade = Quantidade ÷ Duração", () => {
  it("3200 m3 em 25 dias dá 128 por dia", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", linha02);
    expect(l.produtividade).toBeCloseTo(128, 6);
  });

  it("é nula quando não há quantidade — e não zero", () => {
    // Zero diria "mediu zero". Nulo diz "não mediu". São coisas diferentes e o
    // painel precisa separá-las.
    const l = linhaDoCronograma(CAL, "2026-07-15", { ...linha01, quantidade: null });
    expect(l.produtividade).toBeNull();
  });

  it("é nula quando a duração é zero, para não dividir por zero", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", { ...linha01, duracao: 0 });
    expect(l.produtividade).toBeNull();
  });
});

describe("% Planejado = (HOJE − Início + 1) ÷ Duração", () => {
  it("no dia do início vale 1/duração, e não zero", () => {
    // O `+1` da planilha conta o próprio dia do início como decorrido.
    const l = linhaDoCronograma(CAL, "2026-01-05", linha01);
    expect(l.pctPlanejado).toBeCloseTo(1 / 15, 6);
  });

  it("no fim vale 1", () => {
    const l = linhaDoCronograma(CAL, "2026-01-19", linha01);
    expect(l.pctPlanejado).toBeCloseTo(1, 6);
  });

  it("antes do início vale 0, nunca negativo", () => {
    const l = linhaDoCronograma(CAL, "2026-01-01", linha01);
    expect(l.pctPlanejado).toBe(0);
  });

  it("depois do fim trava em 1, nunca passa de 100%", () => {
    const l = linhaDoCronograma(CAL, "2026-06-01", linha01);
    expect(l.pctPlanejado).toBe(1);
  });
});

describe("% Real = Executado ÷ Quantidade", () => {
  it("tudo executado vale 1", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", linha02);
    expect(l.pctReal).toBeCloseTo(1, 6);
  });

  it("metade executada vale 0,5", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", { ...linha02, executado: 1600 });
    expect(l.pctReal).toBeCloseTo(0.5, 6);
  });

  it("sem quantidade vale 0, e a linha fica fora da média", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", { ...linha01, executado: 5, quantidade: null });
    expect(l.pctReal).toBe(0);
  });
});

describe("Status", () => {
  it("100% executado é Concluído, mesmo com a data já passando", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", linha02);
    expect(l.status).toBe("Concluido");
  });

  it("parcialmente executado é Em andamento", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", { ...linha02, executado: 1600 });
    expect(l.status).toBe("Em andamento");
  });

  it("nada executado e fim passado é Atrasado", () => {
    // 05.02 começa em 15/10/2026; com hoje em 15/07 ainda não começou, então
    // precisa de uma atividade que já tenha terminado.
    const l = linhaDoCronograma(CAL, "2026-07-15", { ...linha01, executado: 0 });
    expect(l.status).toBe("Atrasado");
  });

  it("nada executado e fim no futuro é Não iniciado", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", linha15);
    expect(l.status).toBe("Nao iniciado");
  });

  it("concluído ganha de atrasado — a quantidade manda sobre a data", () => {
    // Uma atividade que passou do prazo e chegou a 100% é Concluído, não
    // Atrasado. É a ordem das fórmulas da planilha e ela importa: inverter
    // faria toda obra terminada aparecer como atrasada.
    const l = linhaDoCronograma(CAL, "2026-12-31", linha02);
    expect(l.status).toBe("Concluido");
  });
});

describe("grade", () => {
  it("ordena por código, como a planilha", () => {
    const linhas = gradeDoCronograma(CAL, "2026-07-15", [linha15, linha02, linha01]);
    expect(linhas.map(l => l.codigo)).toEqual(["01.01", "02.01", "05.02"]);
  });

  it("linha sem entrada não quebra", () => {
    const l = linhaDoCronograma(CAL, "2026-07-15", {
      ...linha01,
      duracao: Number.NaN,
      executado: Number.NaN,
    });
    expect(l.fim).toBe(linha01.inicio);
    expect(l.pctReal).toBe(0);
    expect(l.status).toBe("Nao iniciado");
  });
});

describe("meses do Gantt", () => {
  it("cobre do mês do início ao mês do fim, inclusive", () => {
    // 02.02 vai de 16/02 a 27/03 na planilha: dois meses.
    const l = linhaDoCronograma(CAL, "2026-07-15", {
      ...linha01,
      inicio: "2026-02-16",
      duracao: 40,
    });
    expect(mesesOcupados(l.inicio, l.fim)).toEqual(["2026-02", "2026-03"]);
  });

  it("atividade dentro de um mês só ocupa um mês", () => {
    expect(mesesOcupados("2026-01-05", "2026-01-19")).toEqual(["2026-01"]);
  });

  it("vira o ano corretamente", () => {
    // 07.01 vai de 01/06/2027 a 20/06/2027: June only.
    expect(mesesOcupados("2027-06-01", "2027-06-20")).toEqual(["2027-06"]);
    expect(mesesOcupados("2026-11-09", "2027-01-17")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("início invertido devolve vazio, não a guarda inteira", () => {
    // Antes devolvia 2400 meses: o laço só parava ao achar o mês do fim, e um
    // fim anterior ao início nunca é alcançado.
    expect(mesesOcupados("2026-05-01", "2026-04-01")).toEqual([]);
  });
});

describe("painel", () => {
  const hoje: IsoDate = "2026-07-15";

  it("pondera por quantidade, e não faz média simples", () => {
    // Duas linhas de 1000 cada, uma a 100% e outra a 0%: a média simples daria
    // 50% e a ponderada também. Com quantidades diferentes, a simples mente.
    const linhas = gradeDoCronograma(CAL, hoje, [
      { ...linha01, codigo: "A", quantidade: 9000, executado: 9000 },
      { ...linha01, codigo: "B", quantidade: 1000, executado: 0 },
    ]);
    const a = agregadoDoCronograma(linhas);
    expect(a.avancoFisico).toBeCloseTo(0.9, 6);
  });

  it("linha sem quantidade fica fora da média e é contada", () => {
    const linhas = gradeDoCronograma(CAL, hoje, [
      { ...linha01, codigo: "A", quantidade: 1000, executado: 500 },
      { ...linha01, codigo: "B", quantidade: null, executado: 9999 },
    ]);
    const a = agregadoDoCronograma(linhas);
    expect(a.avancoFisico).toBeCloseTo(0.5, 6);
    expect(a.linhasPonderadas).toBe(1);
    expect(a.linhasSemQuantidade).toBe(1);
    expect(a.totalAtividades).toBe(2);
  });

  it("conta as quatro posições de status", () => {
    const linhas = gradeDoCronograma(CAL, hoje, [linha01, linha02, linha15]);
    const a = agregadoDoCronograma(linhas);
    const total = Object.values(a.contagemPorStatus).reduce((s, n) => s + n, 0);
    expect(total).toBe(3);
    expect(a.contagemPorStatus.Concluido).toBe(2);
    expect(a.contagemPorStatus["Nao iniciado"]).toBe(1);
  });

  it("desvio é real menos planejado, e negativo é atraso", () => {
    const linhas = gradeDoCronograma(CAL, hoje, [{ ...linha15, executado: 0 }]);
    const a = agregadoDoCronograma(linhas);
    // 05.02 só começa em outubro; em julho o planejado é 0 e o real é 0.
    expect(a.desvio).toBe(0);
  });

  it("obra sem atividade não quebra e não inventa prazo", () => {
    const a = agregadoDoCronograma(gradeDoCronograma(CAL, hoje, []));
    expect(a.totalAtividades).toBe(0);
    expect(a.prazoDias).toBeNull();
    expect(a.avancoFisico).toBe(0);
  });

  it("prazo vai do primeiro início ao último fim", () => {
    const linhas = gradeDoCronograma(CAL, hoje, [linha15, linha01, linha02]);
    const a = agregadoDoCronograma(linhas);
    expect(a.inicio).toBe("2026-01-05");
    expect(a.fim).toBe("2027-03-03");
  });
  it("atividade que nem começou não tem avanço planejado", () => {
    // `indexOf` devolve 0 para data anterior ao início, o que faria
    // 1/140 = 0,7% de avanço planejado para uma obra que só começa em outubro.
    const l = linhaDoCronograma(CAL, "2026-07-15", linha15);
    expect(l.pctPlanejado).toBe(0);
  });

  it("atividade sem duração não é 'atrasada'", () => {
    // Sem extensão não existe prazo estourado. Duração zero é dado faltando.
    const l = linhaDoCronograma(CAL, "2026-12-31", { ...linha01, duracao: 0 });
    expect(l.status).toBe("Nao iniciado");
  });
});