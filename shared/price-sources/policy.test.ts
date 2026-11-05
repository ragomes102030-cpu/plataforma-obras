import { describe, expect, it } from "vitest";
import { fontePreferencialParaLocalizacao, fontesPermitidasParaLocalizacao } from "./policy";

describe("política de fontes de custo", () => {
  it("prioriza SEINFRA em Fortaleza", () => {
    expect(fontePreferencialParaLocalizacao("Fortaleza - CE")).toBe("SEINFRA");
    expect(fontesPermitidasParaLocalizacao("Fortaleza - CE")).toEqual(["SEINFRA", "SINAPI"]);
  });
  it("prioriza SINAPI fora do Ceará", () => {
    expect(fontePreferencialParaLocalizacao("São Paulo - SP")).toBe("SINAPI");
    expect(fontesPermitidasParaLocalizacao("São Paulo - SP")).toEqual(["SINAPI", "SEINFRA"]);
  });
});
