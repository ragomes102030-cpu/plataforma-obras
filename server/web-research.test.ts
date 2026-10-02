import { describe, expect, it } from "vitest";
import { buildEapResearchQueries, parseSearchResponse } from "./web-research";

describe("web-research", () => {
  it("converte resultados estruturados do provedor em evidências", () => {
    const result = parseSearchResponse(
      JSON.stringify({
        data: [{
          title: "Practice Standard for Work Breakdown Structures",
          url: "https://www.pmi.org/standards/work-breakdown-structures-third-edition",
          content: "A WBS organiza o escopo total do projeto.",
        }],
      }),
      "WBS construction"
    );

    expect(result).toEqual([
      expect.objectContaining({
        query: "WBS construction",
        title: "Practice Standard for Work Breakdown Structures",
        url: "https://www.pmi.org/standards/work-breakdown-structures-third-edition",
        sourceType: "standard",
      }),
    ]);
  });

  it("gera pesquisas direcionadas aos tipos de bloqueio da EAP", () => {
    const queries = buildEapResearchQueries([
      {
        code: "possible_scope_overlap",
        message: "Há evidência textual de sobreposição entre irmãos.",
      },
      {
        code: "eap_leaf_not_ready",
        message: "Folha ainda não está pronta: falta(m) responsável.",
      },
    ]);

    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(queries.join(" ")).toMatch(/WBS|work package|responsibility|dictionary/i);
  });
});
