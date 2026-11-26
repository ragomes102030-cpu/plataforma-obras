import { describe, expect, it } from "vitest";
import { destinoDaBarreira, primeiraBarreiraDoContexto, rotuloDaBarreira } from "./readiness-gate";
import { avaliarProntidaoObra } from "@shared/obra-readiness";
import type { BloqueioProntidao } from "@shared/obra-readiness";

function barreira(codigo: string, impacta: BloqueioProntidao["impacta"]): BloqueioProntidao {
  return { codigo, titulo: "Pendente", explicacao: "", comoResolver: "", impacta, severidade: "media" };
}

describe("destinos e rótulos da prontidão por domínio", () => {
  it("envia cada etapa para seu módulo e não manda atividade ou rede para Escopo", () => {
    expect(destinoDaBarreira(barreira("ATIVIDADES_SEM_DURACAO", ["cpm"]))).toBe("cpm");
    expect(destinoDaBarreira(barreira("ATIVIDADES_AUSENTES", ["atividades"]))).toBe("atividades");
    expect(destinoDaBarreira(barreira("REDE_COM_CICLO", ["rede", "cpm"]))).toBe("dependencias");
    expect(destinoDaBarreira(barreira("ORCAMENTO_AUSENTE", ["orcamento"]))).toBe("financeiro");
  });

  it("separa LOB de boletim contratual e aponta o módulo financeiro", () => {
    const lob = barreira("LOB_ATIVIDADES_SEM_UNIDADE", ["execucao"]);
    const medicao = barreira("MEDICAO_AUSENTE", ["execucao"]);
    const itensMedicao = barreira("MEDICAO_SEM_ITENS", ["execucao"]);
    const orcamento = barreira("ORCAMENTO_ITENS_PENDENTES", ["orcamento"]);

    expect(destinoDaBarreira(lob)).toBe("linha-balanco");
    expect(destinoDaBarreira(medicao)).toBe("financeiro");
    expect(destinoDaBarreira(itensMedicao)).toBe("financeiro");
    expect(rotuloDaBarreira(lob, true)).toContain("LINHA DE BALANÇO");
    expect(rotuloDaBarreira(medicao, true)).toContain("MEDIÇÃO CONTRATUAL");
    expect(rotuloDaBarreira(orcamento, true)).toContain("CONTROLE FINANCEIRO");
    expect(rotuloDaBarreira(orcamento, false)).toBe("GOVERNANÇA DO PLANEJAMENTO");
  });

  it("filtra avisos por tela e prioriza o bloqueio do cronograma na Dashboard", () => {
    const somenteFinanceiroELob = avaliarProntidaoObra({
      escopo: { declarado: true, validado: true },
      eap: { existe: true, aprovada: true, folhas: 2 },
      atividades: { total: 2, semLocal: 2, semDuracao: 0 },
      rede: { totalAtividades: 2, totalDependencias: 1, ciclos: 0 },
      cpm: { calculadoEm: "2026-11-25T10:00:00Z", alteradoDepois: false, atividadesCalculadas: 2 },
      orcamento: { existe: false, aprovado: false, itens: 0, semComposicao: 0, itensComBloqueioDeAprovacao: 0 },
      lob: { parcelas: 0, foraJanelaCpm: 0, orfas: 0, atividadesSemLocalOperacional: 2 },
    });
    expect(primeiraBarreiraDoContexto(somenteFinanceiroELob, "cronograma")).toBeNull();
    expect(primeiraBarreiraDoContexto(somenteFinanceiroELob, "financeiro")?.codigo).toBe("ORCAMENTO_AUSENTE");
    expect(primeiraBarreiraDoContexto(somenteFinanceiroELob, "linha-balanco")?.codigo).toBe("LOB_ATIVIDADES_SEM_UNIDADE");

    const cronogramaEOrcamentoPendentes = avaliarProntidaoObra({
      escopo: { declarado: true, validado: true },
      eap: { existe: true, aprovada: true, folhas: 2 },
      atividades: { total: 2, semLocal: 0, semDuracao: 1 },
      orcamento: { existe: false, aprovado: false, itens: 0, semComposicao: 0, itensComBloqueioDeAprovacao: 0 },
    });
    expect(primeiraBarreiraDoContexto(cronogramaEOrcamentoPendentes, "dashboard")?.codigo).toBe("ATIVIDADES_SEM_DURACAO");
    expect(primeiraBarreiraDoContexto(cronogramaEOrcamentoPendentes, "baseline")?.codigo).toBe("ATIVIDADES_SEM_DURACAO");
  });
});
