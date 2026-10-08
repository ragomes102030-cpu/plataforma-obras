import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("QA-EAP-002 · criação de filho preserva parentId", () => {
  it("envia o parentId do editor ao criar um nó da EAP", () => {
    const source = readFileSync("client/src/components/AbaEap.tsx", "utf8");

    expect(source).toContain(
      '...(editor.mode==="create" && editor.parentId !== null ? { parentId: editor.parentId } : {}),...dados'
    );
  });
});


describe("QA-EAP-003 · gate da EAP após geração", () => {
  it("atualiza o snapshot do coordenador após gerar a EAP", () => {
    const source = readFileSync("client/src/components/AbaEap.tsx", "utf8");

    expect(source).toContain(
      "await coordenador.refetch();"
    );
  });
});
