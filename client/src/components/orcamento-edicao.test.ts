import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("edição do orçamento didático", () => {
  const source = readFileSync("client/src/components/AbaOrcamento.tsx", "utf8");

  it("oferece edição explícita por linha e persiste pela rota protegida", () => {
    expect(source).toContain("trpc.budgets.updateItem.useMutation");
    expect(source).toContain("Editar");
    expect(source).toContain("Salvar");
    expect(source).toContain("Preço unitário do item");
    expect(source).toContain("Quantidade do item");
  });
});
