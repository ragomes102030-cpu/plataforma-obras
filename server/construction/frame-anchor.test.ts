import { describe, expect, it } from "vitest";
import { validateDependencies } from "./dependency-validator";
import type {
  ScheduleEvidenceActivity,
  ScheduleEvidenceDependency,
} from "./domain-types";

function a(id: string): ScheduleEvidenceActivity {
  return {
    id, projectId: 1, externalId: id, eapRef: "1.1", wbsCode: "1.1", name: id,
    phase: "Execução", startOffset: 0, durationDays: 1, progress: 0,
    status: "Não iniciado", critical: 0, sortOrder: 1,
  };
}
function d(p: string, s: string): ScheduleEvidenceDependency {
  return { id: `${p}-${s}`, projectId: 1, externalId: null, predecessorId: p, successorId: s, type: "FS", lag: 0 };
}

// Verificacao de conciliação: a regra de engenharia diz que frentes paralelas
// são legítimas, mas ancoradas a um marco comum de início e a um de entrega.
// Essa é a forma que o `disconnected_network` NÃO pode rejeitar.
describe("conciliação regra-de-engenharia x disconnected_network", () => {
  it("aceita 8 frentes paralelas ancoradas a um início e a uma entrega comuns", () => {
    const frentes = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"];
    const activities = ["MOB", "ENT", ...frentes].map(a);
    const deps = [
      ...frentes.map(f => d("MOB", f)),   // todas partem da mobilização
      ...frentes.map(f => d(f, "ENT")),   // todas entregam na conclusão
    ];
    const r = validateDependencies(activities, deps);
    expect(r.valid).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("aceita rede única com paralelismo interno (equipes distintas na mesma frente)", () => {
    const r = validateDependencies(
      ["A", "B", "C", "D"].map(a),
      [d("A", "B"), d("A", "C"), d("B", "D"), d("C", "D")]
    );
    expect(r.valid).toBe(true);
  });

  it("ainda rejeita quando falta a âncora comum (o defeito real da AURORA)", () => {
    // 8 frentes paralelas SEM marco comum: o prazo da obra é indefinido —
    // vira o máximo das cadeias, não o resultado do sequenciamento.
    const frentes = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"];
    const activities = frentes.map(a);
    const deps = [d("f1", "f2"), d("f3", "f4"), d("f5", "f6"), d("f7", "f8")];
    const r = validateDependencies(activities, deps);
    expect(r.valid).toBe(false);
    expect(r.issues.map(i => i.code)).toContain("disconnected_network");
  });
});
