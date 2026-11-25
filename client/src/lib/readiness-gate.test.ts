import { describe, expect, it } from "vitest";
import { destinoDaBarreira, rotuloDaBarreira } from "./readiness-gate";
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

  it("separa pendências de LOB e de medição e identifica o domínio do bloqueio", () => {
    const lob = barreira("LOB_ATIVIDADES_SEM_UNIDADE", ["execucao"]);
    const medicao = barreira("MEDICAO_AUSENTE", ["execucao"]);
    const orcamento = barreira("ORCAMENTO_ITENS_PENDENTES", ["orcamento"]);

    expect(destinoDaBarreira(lob)).toBe("linha-balanco");
    expect(destinoDaBarreira(medicao)).toBe("producao");
    expect(rotuloDaBarreira(lob, true)).toContain("LINHA DE BALANÇO");
    expect(rotuloDaBarreira(medicao, true)).toContain("AGUARDA MEDIÇÃO");
    expect(rotuloDaBarreira(orcamento, true)).toContain("CONTROLE FINANCEIRO");
    expect(rotuloDaBarreira(orcamento, false)).toBe("GOVERNANÇA DO PLANEJAMENTO");
  });
});
