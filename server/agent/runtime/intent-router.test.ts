import { describe, expect, it } from "vitest";
import {
  classifyArquimedesIntent,
  casualResponse,
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
});
