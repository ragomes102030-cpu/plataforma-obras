import { describe, expect, it } from "vitest";
import {
  classifyArquimedesIntent,
  casualResponse,
  isExplicitConfirmation,
  isSimpleCasualMessage,
} from "./intent-router";

describe("Arquimedes intent router", () => {
  it("trata saudações como conversa casual", () => {
    expect(classifyArquimedesIntent("Olá")).toBe("casual");
    expect(isSimpleCasualMessage("bom dia")).toBe(true);
  });

  it("não trata uma solicitação técnica como conversa casual", () => {
    expect(classifyArquimedesIntent("Analise minha EAP")).toBe("analise");
    expect(classifyArquimedesIntent("Quantas atividades temos?")).toBe("consulta");
    expect(classifyArquimedesIntent("Crie as atividades da alvenaria")).toBe("operacao");
  });

  it("responde saudação sem protocolo técnico", () => {
    expect(casualResponse("Olá")).toContain("Sou o Arquimedes");
    expect(casualResponse("Olá")).not.toContain("MARCO ATUAL");
  });

  it("classifica mensagem com proibição de mutação como analise, não operacao", () => {
    // Bug: QA suite envia "não aplicar, criar, atualizar, mover ou remover"
    // e o intent-router classificava como operacao porque via os verbos.
    // Correção: se a mensagem contém "READ_ONLY" ou "não aplicar", deve ser analise.
    const msg = "EXECUTE DIAGNÓSTICO EAP QA. Modo estritamente READ_ONLY: não aplicar, criar, atualizar, mover ou remover nenhum nó.";
    expect(classifyArquimedesIntent(msg)).toBe("analise");
  });

  it("classifica mensagem com 'não criar' como analise", () => {
    const msg = "Analise a EAP. Não criar, não atualizar, não mover, não remover.";
    expect(classifyArquimedesIntent(msg)).toBe("analise");
  });

  it("ainda classifica comando real de operação como operacao", () => {
    // Garante que a correção não quebra o caso legítimo
    expect(classifyArquimedesIntent("Crie as atividades da alvenaria")).toBe("operacao");
    expect(classifyArquimedesIntent("Adicione 5 atividades")).toBe("operacao");
  });

  it("classifica confirmação explícita de proposta como operacao", () => {
    // Sem isto, o "confirmo" seria consulta e a mutação proposta nunca rodaria.
    expect(isExplicitConfirmation("confirmo")).toBe(true);
    expect(isExplicitConfirmation("pode aplicar")).toBe(true);
    expect(isExplicitConfirmation("Crie uma atividade")).toBe(false);
    expect(classifyArquimedesIntent("confirmo")).toBe("operacao");
    expect(classifyArquimedesIntent("pode aplicar")).toBe("operacao");
  });

  it("a proibição de mutação vence a confirmação", () => {
    // "confirmo, mas não aplique nada" não pode destravar mutação.
    expect(classifyArquimedesIntent("confirmo o diagnóstico, mas não aplique nada")).toBe("analise");
    expect(classifyArquimedesIntent("confirmo, READ_ONLY, não criar nem atualizar")).toBe("analise");
  });
});
