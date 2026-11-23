import { describe, expect, it } from "vitest";
import { mapCompositionComponentsForEditor } from "./budget-composition-editor";

describe("edição de composições analíticas", () => {
  it("recarrega serviços oficiais, coeficientes, preços e período da composição vinculada", () => {
    const services = mapCompositionComponentsForEditor(
      { id: 26695, sourceCatalogId: 7, referencePeriod: "028.1" },
      [{ id: 7, name: "SEINFRA-CE 028.1", sourceType: "SEINFRA", referencePeriod: "028.1" }],
      [{
        compositionId: 26695,
        priceItemId: 540,
        coefficient: "1.000000",
        unitPriceSnapshot: "6.91",
        itemCode: "C0540",
        itemDescription: "CABO ISOLADO PVC 750V 2,5MM2",
        itemUnit: "M",
      }],
    );

    expect(services).toEqual([{
      id: 540,
      code: "C0540",
      description: "CABO ISOLADO PVC 750V 2,5MM2",
      unit: "M",
      unitPrice: "6.91",
      sourceType: "SEINFRA",
      catalogId: 7,
      catalogName: "SEINFRA-CE 028.1",
      referencePeriod: "028.1",
      coefficient: "1.000000",
    }]);
  });

  it("ignora componentes que pertençam a outra composição", () => {
    const services = mapCompositionComponentsForEditor(
      { id: 26695, sourceCatalogId: 7, referencePeriod: "028.1" },
      [{ id: 7, name: "SEINFRA-CE 028.1", sourceType: "SEINFRA", referencePeriod: "028.1" }],
      [{
        compositionId: 26696,
        priceItemId: 546,
        coefficient: "1.000000",
        unitPriceSnapshot: "13.36",
        itemCode: "C0546",
        itemDescription: "CABO LÓGICO/VÍDEO COAXIAL 95 OHMS",
        itemUnit: "M",
      }],
    );

    expect(services).toEqual([]);
  });

  it("não inventa a origem se o catálogo não estiver disponível", () => {
    const [service] = mapCompositionComponentsForEditor(
      { id: 26695, sourceCatalogId: null, referencePeriod: null },
      [],
      [{
        compositionId: 26695,
        priceItemId: 540,
        coefficient: "1.000000",
        unitPriceSnapshot: "6.91",
        itemCode: "C0540",
        itemDescription: "CABO ISOLADO PVC 750V 2,5MM2",
        itemUnit: "M",
      }],
    );

    expect(service?.catalogId).toBe(0);
    expect(service?.catalogName).toBe("Origem não identificada");
    expect(service?.sourceType).toBe("origem não identificada");
  });
});
