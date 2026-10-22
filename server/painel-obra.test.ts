import { describe, expect, it } from "vitest";
import {
  avaliarFisico,
  avaliarValor,
  diasEntre,
  montarAlertas,
  montarResumo,
  rotuloDoDesvio,
  situacaoEPrazo,
} from "../shared/painel-obra";

describe("diasEntre", () => {
  it("conta dia com dia, sem deslocar por causa do fuso", () => {
    expect(diasEntre("2026-10-22", "2026-10-31")).toBe(9);
    expect(diasEntre("2026-10-31", "2026-10-22")).toBe(-9);
    expect(diasEntre("2026-10-22", "2026-10-22")).toBe(0);
  });

  it("devolve null quando falta data ou o texto não é uma data", () => {
    expect(diasEntre(null, "2026-10-22")).toBeNull();
    expect(diasEntre("2026-10-22", null)).toBeNull();
    expect(diasEntre("22/10/2026", "2026-10-31")).toBeNull();
  });
});

describe("situacaoEPrazo", () => {
  const base = { hoje: "2026-10-22", inicio: "2026-01-01", fim: "2026-12-31", real: 0.2 };

  it("sem datas vira 'sem plano' em vez de fingir prazo infinito", () => {
    const p = situacaoEPrazo({ ...base, inicio: null, fim: null });
    expect(p.situacao).toBe("sem_plano");
    expect(p.diasRestantes).toBeNull();
    expect(p.rotulo).toBe("Sem prazo definido");
  });

  it("antes do início diz em quantos dias começa", () => {
    const p = situacaoEPrazo({ ...base, hoje: "2025-12-30" });
    expect(p.situacao).toBe("nao_iniciada");
    expect(p.rotulo).toBe("Começa em 2 dias");
    expect(p.fracaoDecorrida).toBe(0);
  });

  it("em curso diz quantos dias faltam", () => {
    const p = situacaoEPrazo(base);
    expect(p.situacao).toBe("em_curso");
    expect(p.rotulo).toBe("Faltam 70 dias");
    expect(p.diasRestantes).toBe(70);
  });

  it("depois do fim, com serviço aberto, diz que venceu", () => {
    const p = situacaoEPrazo({ ...base, hoje: "2027-01-08" });
    expect(p.situacao).toBe("atrasada");
    expect(p.rotulo).toBe("Venceu há 8 dias");
    expect(p.diasRestantes).toBe(-8);
  });

  it("termina hoje é um caso próprio", () => {
    const p = situacaoEPrazo({ ...base, hoje: "2026-12-31" });
    expect(p.rotulo).toBe("Termina hoje");
    expect(p.diasRestantes).toBe(0);
  });

  it("avanço de 100% fecha a obra mesmo antes da data", () => {
    const p = situacaoEPrazo({ ...base, real: 1 });
    expect(p.situacao).toBe("concluida");
    expect(p.fracaoDecorrida).toBe(1);
  });

  it("a fração decorrida fica entre 0 e 1", () => {
    expect(situacaoEPrazo({ ...base, hoje: "2025-01-01" }).fracaoDecorrida).toBe(0);
    expect(situacaoEPrazo({ ...base, hoje: "2028-01-01" }).fracaoDecorrida).toBe(1);
  });
});

describe("avanço físico", () => {
  it("desvio é real menos planejado, com sinal e uma casa", () => {
    const f = avaliarFisico(0.196, 0.674);
    expect(f.pontos).toBe(-47.8);
    expect(f.rotulo).toBe("atrasada");
  });

  it("empate e vantagem têm rótulos próprios", () => {
    expect(avaliarFisico(0.5, 0.5).rotulo).toBe("no prazo");
    expect(avaliarFisico(0.52, 0.5).rotulo).toBe("adiantada");
    expect(rotuloDoDesvio(0)).toBe("no prazo");
  });
});

describe("avaliarValor", () => {
  it("sem orçamento não inventa percentual", () => {
    const v = avaliarValor({ total: 0, distribuido: 0, executado: 0 });
    expect(v.pctExecutado).toBeNull();
    expect(v.semAtividade).toBe(0);
  });

  it("separa o que está preso a atividade do que sobrou", () => {
    const v = avaliarValor({ total: 1000, distribuido: 800, executado: 200 });
    expect(v.semAtividade).toBe(200);
    expect(v.pctDistribuido).toBeCloseTo(0.8);
    expect(v.pctExecutado).toBeCloseTo(0.2);
  });

  it("não deixa valor executado passar do orçamento", () => {
    const v = avaliarValor({ total: 100, distribuido: 100, executado: 300 });
    expect(v.executado).toBe(100);
    expect(v.pctExecutado).toBe(1);
  });
});

describe("montarAlertas", () => {
  it("não inventa alerta quando não há problema", () => {
    expect(montarAlertas({})).toEqual([]);
    expect(montarAlertas({ atrasadas: 0, bloqueadas: 0, ppc: 100 })).toEqual([]);
  });

  it("põe crítico na frente e limita a seis", () => {
    const lista = montarAlertas({
      atrasadas: 34,
      maiorAtrasoDias: 418,
      foraDoPlano: 3,
      bloqueadas: 2,
      valorSemAtividade: 1000,
      ppc: 40,
      semQuantidade: 4,
      riscosAltos: 1,
      atrasoBaselineDias: 250,
    });
    expect(lista).toHaveLength(6);
    expect(lista[0].nivel).toBe("critico");
    expect(lista[0].id).toBe("fora-do-plano");
    expect(lista.slice(0, 3).every((a) => a.nivel === "critico")).toBe(true);
  });

  it("cada alerta aponta para uma aba que resolve o assunto", () => {
    const lista = montarAlertas({
      atrasadas: 1,
      foraDoPlano: 1,
      bloqueadas: 1,
      valorSemAtividade: 1,
      ppc: 10,
      semQuantidade: 1,
      riscosAltos: 1,
      atrasoBaselineDias: 1,
    });
    for (const a of lista) {
      expect(a.aba, a.id).toBeTruthy();
      expect(a.acao, a.id).toBeTruthy();
    }
  });
});

describe("montarResumo", () => {
  const status = { total: 53, concluidas: 10, emAndamento: 0, atrasadas: 34, naoIniciadas: 9 };

  it("atraso de avanço vira selo 'Atrasada' mesmo com prazo em dia", () => {
    const r = montarResumo({
      hoje: "2026-10-22",
      inicio: "2026-01-01",
      fim: "2027-12-31",
      fisico: { real: 0.196, planejado: 0.674 },
      status,
      valor: { total: 1000, distribuido: 1000, executado: 196 },
      alertas: { atrasadas: 34, maiorAtrasoDias: 418 },
    });
    expect(r.selo.tipo).toBe("atrasada");
    expect(r.selo.rotulo).toBe("Atrasada");
    expect(r.prazo.rotulo).toBe("Faltam 435 dias");
  });

  it("risco crítico sem atraso de prazo vira 'Atenção', não 'Atrasada'", () => {
    const r = montarResumo({
      hoje: "2026-10-22",
      inicio: "2026-01-01",
      fim: "2027-12-31",
      fisico: { real: 0.7, planejado: 0.69 },
      status,
      valor: { total: 0, distribuido: 0, executado: 0 },
      alertas: { foraDoPlano: 2 },
    });
    expect(r.selo.tipo).toBe("atencao");
    expect(r.selo.rotulo).toBe("Atenção");
  });

  it("obra tranquila vira 'No prazo'", () => {
    const r = montarResumo({
      hoje: "2026-10-22",
      inicio: "2026-01-01",
      fim: "2027-12-31",
      fisico: { real: 0.5, planejado: 0.5 },
      status,
      valor: { total: 1000, distribuido: 900, executado: 450 },
      alertas: {},
    });
    expect(r.selo.tipo).toBe("em_curso");
    expect(r.selo.rotulo).toBe("No prazo");
    expect(r.valor.semAtividade).toBe(100);
  });
});
