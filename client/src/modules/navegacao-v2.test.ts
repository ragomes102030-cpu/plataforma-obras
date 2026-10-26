import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ABAS } from "./abas";
import { GRUPOS_V2, ROTULOS_V2, auditarCoberturaDeAbasV2, grupoDaAbaV2 } from "./navegacao-v2";

describe("Plataforma Obras V2: equivalência funcional das abas", () => {
  it("possui seis áreas principais, sem duplicações ou sumiço de módulos", () => {
    expect(GRUPOS_V2).toHaveLength(6);
    const auditoria = auditarCoberturaDeAbasV2();
    expect(auditoria).toEqual({ ausentes: [], duplicadas: [], desconhecidas: [] });
    expect(ABAS).toHaveLength(17);
  });

  it("preserva os IDs existentes — não substitui abas reais por telas fictícias", () => {
    const ids = new Set(ABAS.map(aba => aba.id));
    for (const grupo of GRUPOS_V2) {
      expect(grupo.abas.length).toBeGreaterThan(0);
      expect(grupo.abas).toContain(grupo.abaInicial);
      for (const aba of grupo.abas) {
        expect(ids.has(aba)).toBe(true);
        expect(grupoDaAbaV2(aba)?.id).toBe(grupo.id);
        expect(ROTULOS_V2[aba]).toBeTruthy();
      }
    }
    expect(ids.has("comando")).toBe(true);
    expect(grupoDaAbaV2("comando")).toBeUndefined(); // acessível somente como ferramenta administrativa
    expect(ROTULOS_V2.comando).toBeTruthy();
  });

  it("mantém ferramentas de engenharia e acompanhamento nos lugares apropriados", () => {
    const planning = GRUPOS_V2.find(grupo => grupo.id === "planejamento");
    expect(planning?.abas).toEqual([
      "escopo", "eap", "atividades", "dependencias",
      "cpm", "baseline", "gantt", "linha-balanco",
    ]);
    const execution = GRUPOS_V2.find(grupo => grupo.id === "execucao");
    expect(execution?.abas).toContain("curva-s");
    const supplies = GRUPOS_V2.find(grupo => grupo.id === "suprimentos");
    expect(supplies?.abas).toContain("catalogo");
    expect(GRUPOS_V2.find(grupo => grupo.id === "gestao")?.abas).toEqual(["documentos", "riscos"]);
  });

  it("altera somente a moldura sob opt-in, preservando os componentes e APIs de trabalho", () => {
    const home = readFileSync(path.resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const main = readFileSync(path.resolve(process.cwd(), "client/src/main.tsx"), "utf8");
    expect(home).toContain('get("ui") === "v2"');
    expect(home).toContain("po-v2-live");
    expect(home).toContain('usuario?.role === "admin"');
    const required = [
      "PainelDoCronograma", "EscopoInicial", "AbaEap", "PainelPlanejamento",
      "AbaDependencias", "AbaCpm", "AbaBaseline", "VisualizacaoPlanejamento",
      "AbaProducao", "DocumentosDaObra", "AbaSuprimentos", "AbaOrcamento",
      "AbaRiscos", "AbaCurvaS", "AbaCatalogo", "CentralComandoArquimedes",
      "JanelaAgente",
    ];
    for (const component of required) {
      expect(home).toContain("<" + component);
    }
    expect(main).toContain('import "@/design-v2/live-shell.css"');
    expect(main).toContain("<App />");
    expect(main).toContain("/api/trpc");
  });
});
