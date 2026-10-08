import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("QA-EAP-002 · criação de filho preserva parentId", () => {
  it("envia o parentId do editor ao criar um nó da EAP", () => {
    const source = readFileSync("client/src/components/AbaEap.tsx", "utf8");

    expect(source).toContain(
      'parentId:editor.mode==="create"?editor.parentId:undefined'
    );
  });
});
