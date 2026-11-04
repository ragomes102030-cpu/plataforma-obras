import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("aba de riscos persistente", () => {
  const source = readFileSync("client/src/components/AbaRiscos.tsx", "utf8");

  it("apresenta cadastro e consulta persistentes, sem dados fictícios", () => {
    expect(source).toContain("Registro de riscos");
    expect(source).toContain("Nenhum risco cadastrado nesta obra.");
    expect(source).toContain("trpc.risks.list.useQuery");
    expect(source).toContain("trpc.risks.create.useMutation");
    expect(source).not.toContain("Atraso na entrega de concreto usinado");
  });
});
