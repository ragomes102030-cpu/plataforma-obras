import { describe, expect, it } from "vitest";
import type { wbsNodes } from "../../drizzle/schema";
import { sameEapContent } from "./eap-content";

type EapNode = typeof wbsNodes.$inferSelect;
const node = (id: number, parentId: number | null, code: string, name: string) => ({
  id, parentId, code, name, description: null, inclusions: null, exclusions: null,
  location: null, responsible: null, acceptanceCriteria: null,
  decompositionBasis: null, scopeStatus: "rascunho", level: parentId ? 2 : 1,
  nodeType: parentId ? "pacote" : "fase", unit: null, plannedQuantity: null,
  sortOrder: id,
} as EapNode);

describe("sameEapContent", () => {
  it("aceita a cópia da EAP aprovada mesmo com novos IDs", () => {
    const approved = [node(1, null, "1", "Obra"), node(2, 1, "1.1", "Fundação")];
    const draft = [node(10, null, "1", "Obra"), node(11, 10, "1.1", "Fundação")];
    draft[0].sortOrder = approved[0].sortOrder;
    draft[1].sortOrder = approved[1].sortOrder;
    expect(sameEapContent(draft, approved)).toBe(true);
  });

  it("ignora o status de governança ao comparar a cópia técnica da EAP", () => {
    const approved = [node(1, null, "1", "Obra")];
    const draft = [node(10, null, "1", "Obra")];
    draft[0].scopeStatus = "aprovado";
    draft[0].sortOrder = approved[0].sortOrder;
    expect(sameEapContent(draft, approved)).toBe(true);
  });

  it("bloqueia a criação se a EAP da versão de trabalho mudou", () => {
    const approved = [node(1, null, "1", "Obra"), node(2, 1, "1.1", "Fundação")];
    const draft = [node(10, null, "1", "Obra"), node(11, 10, "1.1", "Fundação alterada")];
    expect(sameEapContent(draft, approved)).toBe(false);
  });
});
