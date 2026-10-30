import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deveRevalidarDadosDaObraAposExecucao } from "../lib/agent-run-cache";

const janela = readFileSync("client/src/components/JanelaAgente.tsx", "utf8");

describe("refresh de dados depois de uma execução do Arquimedes", () => {
  it("revalida a obra quando uma operação termina com sucesso", () => {
    expect(deveRevalidarDadosDaObraAposExecucao({ status: "respondido", readOnly: false })).toBe(true);
  });

  it("não revalida quando a resposta foi somente leitura", () => {
    expect(deveRevalidarDadosDaObraAposExecucao({ status: "respondido", readOnly: true })).toBe(false);
  });

  it("não revalida execuções incompletas mesmo que fossem operacionais", () => {
    expect(deveRevalidarDadosDaObraAposExecucao({ status: "timeout", readOnly: false })).toBe(false);
  });

  it("conecta a conclusão operacional à invalidação das queries", () => {
    expect(janela).toContain("deveRevalidarDadosDaObraAposExecucao(s)");
    expect(janela).toContain("void utils.invalidate()");
  });
});

describe("histórico de conversas do Arquimedes", () => {
  it("permite iniciar e retomar conversas separadas por obra", () => {
    expect(janela).toContain("Nova conversa");
    expect(janela).toContain("Conversas do Arquimedes");
    expect(janela).toContain("conversationId: conversaId");
  });

  it("mostra mensagens recentes e mantém acesso ao histórico completo", () => {
    expect(janela).toContain("LIMITE_MENSAGENS_VISIVEIS = 6");
    expect(janela).toContain("historico.slice(-LIMITE_MENSAGENS_VISIVEIS)");
    expect(janela).toContain("Ocultar mensagens anteriores");
  });
});
