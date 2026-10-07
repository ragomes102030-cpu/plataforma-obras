import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Linha de Balanço — regressão visual", () => {
  const file = path.resolve(process.cwd(), "client/src/components/VisualizacaoPlanejamento.tsx");
  const source = fs.readFileSync(file, "utf8");

  it("mantém tempo no eixo horizontal e localização no eixo vertical", () => {
    expect(source).toContain("const pxPerDay =");
    expect(source).toContain("const yByLocation = new Map");
    expect(source).toContain('className="pl-lob-location"');
    expect(source).toContain('className="pl-lob-date"');
    expect(source).toContain("TEMPO →");
  });

  it("desenha barras por serviço/localização e linha de ritmo", () => {
    expect(source).toContain("pl-lob-service");
    expect(source).toContain("pl-lob-rhythm");
    expect(source).toContain("servico.key");
    expect(source).toContain("l.pavimento || l.frente");
  });

  it("evita a escala anterior que multiplicava a altura por dia", () => {
    expect(source).not.toContain("const y = (iso: string) => top + ((dateMs(iso) - dateMs(dados.start)) / 86400000) * rowH;");
    expect(source).not.toContain("dados.total * rowH");
  });
});
