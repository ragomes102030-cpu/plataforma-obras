import { describe, expect, it } from "vitest";
import { prepararEntradaDuracaoAtividade } from "./activity-duration-form";

describe("estimativa exigida ao criar atividade a partir da EAP", () => {
  it("aceita uma duração manual positiva", () => {
    expect(prepararEntradaDuracaoAtividade({ duracaoDias: "5", quantidade: "", produtividade: "" })).toEqual({
      valid: true,
      payload: { durationDays: 5 },
    });
  });

  it("aceita quantidade e produtividade válidas para estimar duração", () => {
    expect(prepararEntradaDuracaoAtividade({ duracaoDias: "", quantidade: "120", produtividade: "30" })).toEqual({
      valid: true,
      payload: { plannedQuantity: 120, productivity: 30 },
    });
  });

  it("recusa criar atividade sem duração ou com quantidade sem produtividade", () => {
    expect(prepararEntradaDuracaoAtividade({ duracaoDias: "", quantidade: "", produtividade: "" }).valid).toBe(false);
    expect(prepararEntradaDuracaoAtividade({ duracaoDias: "", quantidade: "120", produtividade: "" }).valid).toBe(false);
  });

  it("não trata duração inválida como se estivesse em branco", () => {
    expect(prepararEntradaDuracaoAtividade({ duracaoDias: "0", quantidade: "120", produtividade: "30" }).valid).toBe(false);
    expect(prepararEntradaDuracaoAtividade({ duracaoDias: "1,5", quantidade: "", produtividade: "" }).valid).toBe(false);
  });
});
