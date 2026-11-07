import { describe, expect, it } from "vitest";
import { avaliarProntidaoObra } from "./obra-readiness";

describe("motor de prontidão integrada", () => {
  it("bloqueia a cadeia quando o orçamento tem item didático", () => {
    const result = avaliarProntidaoObra({
      escopo: { declarado: true, validado: true },
      eap: { existe: true, aprovada: true, folhas: 3 },
      orcamento: { existe: true, aprovado: true, itens: 3, semComposicao: 0, didaticos: 1 },
      atividades: { total: 3, semLocal: 0, semDuracao: 0 },
      rede: { totalAtividades: 3, totalDependencias: 2, ciclos: 0, semPredecessora: 0 },
      cpm: { calculadoEm: "2026-11-06T10:00:00Z", alteradoDepois: false, atividadesCalculadas: 3 },
      baseline: { existe: true, aprovada: true },
      execucao: { medicoes: 1, comUnidade: 1, confirmadas: 1 },
    });
    expect(result.etapas.orcamento.estado).toBe("incompleto");
    expect(result.primeiraBarreira?.codigo).toBe("ORCAMENTO_DIDATICO");
    expect(result.prontoParaPlanejamento).toBe(true);
    expect(result.prontoParaAcompanhamento).toBe(false);
  });

  it("bloqueia acompanhamento se parcelas LOB contradizem a rede CPM, sem bloquear edição do planejamento", () => {
    const result = avaliarProntidaoObra({
      escopo: { declarado: true, validado: true },
      eap: { existe: true, aprovada: true, folhas: 3 },
      orcamento: { existe: true, aprovado: true, itens: 3, semComposicao: 0, didaticos: 0 },
      atividades: { total: 3, semLocal: 0, semDuracao: 0 },
      rede: { totalAtividades: 3, totalDependencias: 2, ciclos: 0, semPredecessora: 0 },
      cpm: { calculadoEm: "2026-11-06T10:00:00Z", alteradoDepois: false, atividadesCalculadas: 3 },
      baseline: { existe: true, aprovada: true },
      lob: { parcelas: 9, foraJanelaCpm: 3, orfas: 0 },
      execucao: { medicoes: 1, comUnidade: 1, confirmadas: 1 },
    });
    expect(result.etapas.execucao.bloqueios.map(b => b.codigo)).toContain("LOB_FORA_JANELA_CPM");
    expect(result.prontoParaPlanejamento).toBe(true);
    expect(result.prontoParaAcompanhamento).toBe(false);
  });

  it("não aprova acompanhamento com parcelas em locais didáticos mesmo quando datas CPM são compatíveis", () => {
    const result = avaliarProntidaoObra({
      escopo: { declarado: true, validado: true },
      eap: { existe: true, aprovada: true, folhas: 3 },
      orcamento: { existe: true, aprovado: true, itens: 3, semComposicao: 0, didaticos: 0 },
      atividades: { total: 3, semLocal: 0, semDuracao: 0 },
      rede: { totalAtividades: 3, totalDependencias: 2, ciclos: 0, semPredecessora: 0 },
      cpm: { calculadoEm: "2026-11-06T10:00:00Z", alteradoDepois: false, atividadesCalculadas: 3 },
      baseline: { existe: true, aprovada: true },
      lob: { parcelas: 9, foraJanelaCpm: 0, orfas: 0, parcelasEmLocaisDidaticos: 9 },
      execucao: { medicoes: 1, comUnidade: 1, confirmadas: 1 },
    });
    expect(result.etapas.execucao.bloqueios.map(b => b.codigo)).toContain("LOB_LOCAL_DIDATICO");
    expect(result.prontoParaPlanejamento).toBe(true);
    expect(result.prontoParaAcompanhamento).toBe(false);
  });

  it("explica como resolver uma rede com ciclo", () => {
    const result = avaliarProntidaoObra({ rede: { totalAtividades: 2, totalDependencias: 2, ciclos: 1, semPredecessora: 0 } });
    expect(result.etapas.rede.bloqueios[0].comoResolver).toContain("Remova");
    expect(result.etapas.cpm.estado).toBe("desatualizado");
  });

  it("bloqueia atividade órfã e medição sem itens", () => {
    const result = avaliarProntidaoObra({
      escopo: { declarado: true, validado: true },
      eap: { existe: true, aprovada: true, folhas: 2 },
      orcamento: { existe: true, aprovado: true, itens: 2, semComposicao: 0, didaticos: 0 },
      atividades: { total: 2, semLocal: 0, semDuracao: 0 },
      rede: { totalAtividades: 2, totalDependencias: 1, ciclos: 0, semPredecessora: 1 },
      cpm: { calculadoEm: null, alteradoDepois: false, atividadesCalculadas: 0 },
      baseline: { existe: false, aprovada: false },
      execucao: { medicoes: 1, comUnidade: 0, confirmadas: 0 },
    });
    expect(result.etapas.rede.bloqueios[0].codigo).toBe("REDE_SEM_PREDECESSORA");
    expect(result.etapas.execucao.bloqueios[0].codigo).toBe("MEDICAO_SEM_ITENS");
  });
});
