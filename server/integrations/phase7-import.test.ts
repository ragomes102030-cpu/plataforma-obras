import { describe, expect, it } from "vitest";
import { buildPhase7ImportPlan } from "./phase7-import";

const eap = {
  raizes: [{
    eap_id: "1",
    uid: "uid-root",
    nivel: 1,
    nome: "Obra de homologação",
    filhos: [{
      eap_id: "1.1",
      uid: "uid-1-1",
      parent_id: "1",
      nivel: 2,
      nome: "Fundação",
      unidade: "m³",
      quantidade: 10,
      filhos: [],
    }],
  }],
};

const activities = {
  atividades: [{
    id: "atv-1",
    eap_ref: "1.1",
    nome: "Executar fundação",
    duracao_dias: 10,
    percentual_concluido: 25,
    data_inicio_planejada: "2026-10-01",
    critica: 1,
  }],
};

const dependencies = { dependencias: [] };
const cpm = { caminho_critico: ["atv-1"], duracao_total_dias: 10 };

const result = (structuredContent: unknown) => ({ structuredContent });

describe("phase 7 import plan", () => {
  it("normaliza EAP, atividades, CPM e preserva IDs externos", () => {
    const plan = buildPhase7ImportPlan(
      "obra-homologacao",
      result(eap),
      result(activities),
      result(dependencies),
      result(cpm)
    );
    expect(plan.wbsNodes.map(node => node.externalId)).toEqual(["1", "1.1"]);
    expect(plan.activities[0]).toMatchObject({
      externalId: "atv-1",
      eapRef: "1.1",
      progress: 25,
      critical: 1,
    });
    expect(plan.criticalPath).toEqual(["atv-1"]);
    expect(plan.totalDurationDays).toBe(10);
  });

  it("rejeita EAP com mais de uma raiz", () => {
    expect(() => buildPhase7ImportPlan(
      "obra-homologacao",
      result({ raizes: [eap.raizes[0], { ...eap.raizes[0], eap_id: "2" }] }),
      result(activities),
      result(dependencies)
    )).toThrow("uma única raiz");
  });

  it("rejeita atividade que aponta para nó EAP inexistente", () => {
    expect(() => buildPhase7ImportPlan(
      "obra-homologacao",
      result(eap),
      result({ atividades: [{ ...activities.atividades[0], eap_ref: "9.9" }] }),
      result(dependencies)
    )).toThrow("referencia EAP inexistente");
  });
});
