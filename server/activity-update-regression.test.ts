import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const router = readFileSync("server/routers.ts", "utf-8");
const painel = readFileSync("client/src/components/PainelPlanejamento.tsx", "utf-8");

describe("activity editing regression contract", () => {
  it("keeps the activity update mutation auditable and CPM-safe", () => {
    const start = router.indexOf("atualizarAtividade: protectedProcedure");
    const end = router.indexOf("control: protectedProcedure", start);
    const block = router.slice(start, end);

    expect(block).toContain('action: "activity_updated"');
    expect(block).toContain("cpmInvalidated");
    expect(block).toContain("cpmCalculatedAt: null");
    expect(block).toContain("wbsNodeId: activity.wbsNodeId");
    expect(block).toContain("eapRef: activity.eapRef");
    expect(block).toContain("planVersionId: activity.versionId");
  });

  it("keeps existing activities editable in the real activities page", () => {
    expect(painel).toContain("atualizarAtividade.useMutation");
    expect(painel).toContain('aria-label={"Duração de " + activity.name}');
    expect(painel).toContain('aria-label={"Quantidade de " + activity.name}');
    expect(painel).toContain('aria-label={"Unidade de " + activity.name}');
    expect(painel).toContain('onBlur={() => salvarEdicao(activity.id, "duracao")}');
  });
});
