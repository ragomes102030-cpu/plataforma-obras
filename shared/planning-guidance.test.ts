import { describe, expect, it } from "vitest";
import { orientarFluxoPlanejamento, type EntradaDaOrientacao } from "./planning-guidance";

const atividade = {
  id: 10,
  durationDays: 5,
  cpmCalculatedAt: "2026-11-04T12:00:00Z",
  updatedAt: "2026-11-04T11:00:00Z",
};

const plano = (extra: Partial<EntradaDaOrientacao> = {}): EntradaDaOrientacao => ({
  eapApproved: true,
  canCreateActivities: true,
  currentVersionNumber: 8,
  activities: [atividade],
  networkValidation: { valid: true, issues: [] },
  baselines: [{ status: "ativa", versionId: 80 }],
  approvedVersionId: 80,
  ...extra,
});

describe("orientação didática do fluxo de planejamento", () => {
  it("explica cada etapa bloqueada na ordem operacional", () => {
    const casos: [string, EntradaDaOrientacao][] = [
      ["eap-nao-aprovada", plano({ eapApproved: false, canCreateActivities: false })],
      ["atividades-ausentes", plano({ activities: [] })],
      ["duracoes-invalidas", plano({ activities: [{ ...atividade, durationDays: 0 }] })],
      ["rede-ausente", plano({ networkValidation: null })],
      ["rede-invalida", plano({ networkValidation: { valid: false, issues: [{ message: "Ciclo detectado" }] } })],
      ["cpm-desatualizado", plano({ activities: [{ ...atividade, updatedAt: "2026-11-05T12:00:00Z" }] })],
      ["baseline-ausente", plano({ baselines: [] })],
    ];

    expect(casos.map(([, entrada]) => orientarFluxoPlanejamento(entrada).primaria?.id)).toEqual(
      casos.map(([id]) => id),
    );
  });

  it("sempre fornece causa, consequência, resolução, destino e prova de conclusão", () => {
    const orientacoes = [
      orientarFluxoPlanejamento(plano({ eapApproved: false, canCreateActivities: false })).primaria,
      orientarFluxoPlanejamento(plano({ activities: [] })).primaria,
      orientarFluxoPlanejamento(plano({ networkValidation: null })).primaria,
      orientarFluxoPlanejamento(plano({ activities: [{ ...atividade, updatedAt: "2026-11-05T12:00:00Z" }] })).primaria,
      orientarFluxoPlanejamento(plano({ baselines: [] })).primaria,
    ];
    for (const orientacao of orientacoes) {
      expect(orientacao).toMatchObject({
        severidade: "bloqueio",
        titulo: expect.any(String),
        oQueAconteceu: expect.any(String),
        porQueBloqueia: expect.any(String),
        abaDestino: expect.any(String),
        rotuloAcao: expect.any(String),
        evidenciaDeResolucao: expect.any(String),
      });
      expect(orientacao?.passos.length).toBeGreaterThan(0);
    }
  });

  it("mantém múltiplos bloqueios em ordem sem esconder os seguintes", () => {
    const resultado = orientarFluxoPlanejamento(plano({
      activities: [{ ...atividade, durationDays: 0 }],
      networkValidation: { valid: false, issues: [{ message: "Ligação inválida" }] },
      baselines: [],
    }));
    expect(resultado.bloqueado).toBe(true);
    expect(resultado.primaria?.id).toBe("duracoes-invalidas");
    expect(resultado.demais.map(item => item.id)).toEqual(["rede-invalida"]);
    expect(resultado.demais[0]?.detalhesTecnicos).toContain("Ligação inválida");
  });

  it("libera o acompanhamento quando a cadeia está confirmada", () => {
    expect(orientarFluxoPlanejamento(plano())).toEqual({
      bloqueado: false,
      primaria: null,
      demais: [],
    });
  });
});
