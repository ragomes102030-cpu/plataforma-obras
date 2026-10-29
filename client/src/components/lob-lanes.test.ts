import { describe, expect, it } from "vitest";
import { empacotarFaixasVisiveis } from "./lob-lanes";

describe("faixas da Linha de Balanço", () => {
  it("ignora atividades totalmente fora da janela visível ao calcular a altura", () => {
    const resultado = empacotarFaixasVisiveis(
      [
        { codigo: "visivel", inicio: "2026-10-20", fim: "2026-10-24" },
        ...Array.from({ length: 12 }, (_, indice) => ({
          codigo: `fora-${indice}`,
          inicio: "2028-01-01",
          fim: "2028-12-31",
        })),
      ],
      "2026-10-01",
      "2026-11-01"
    );

    expect(resultado.quantidade).toBe(1);
    expect(resultado.porCodigo).toEqual(new Map([["visivel", 0]]));
  });

  it("reutiliza faixas sem sobreposição e separa períodos simultâneos", () => {
    const resultado = empacotarFaixasVisiveis(
      [
        { codigo: "a", inicio: "2026-10-01", fim: "2026-10-05" },
        { codigo: "b", inicio: "2026-10-02", fim: "2026-10-04" },
        { codigo: "c", inicio: "2026-10-06", fim: "2026-10-08" },
      ],
      "2026-10-01",
      "2026-10-10"
    );

    expect(resultado.quantidade).toBe(2);
    expect(resultado.porCodigo.get("a")).toBe(0);
    expect(resultado.porCodigo.get("b")).toBe(1);
    expect(resultado.porCodigo.get("c")).toBe(0);
  });

  it("considera o término inclusivo ao reutilizar uma faixa", () => {
    const resultado = empacotarFaixasVisiveis(
      [
        { codigo: "a", inicio: "2026-10-01", fim: "2026-10-05" },
        { codigo: "b", inicio: "2026-10-05", fim: "2026-10-07" },
      ],
      "2026-10-01",
      "2026-10-10"
    );

    expect(resultado.quantidade).toBe(2);
  });
});
