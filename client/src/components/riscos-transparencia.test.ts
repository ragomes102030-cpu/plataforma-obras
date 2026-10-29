import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("aba de riscos sem persistência", () => {
  const source = readFileSync("client/src/components/AbaRiscos.tsx", "utf8");

  it("não apresenta dados fictícios ou um formulário que não salva", () => {
    expect(source).toContain("Registro de riscos ainda não habilitado");
    expect(source).toContain("ainda não grava nem consulta riscos");
    expect(source).not.toContain("useState");
    expect(source).not.toContain("handleSubmit");
    expect(source).not.toContain("Atraso na entrega de concreto usinado");
  });
});
