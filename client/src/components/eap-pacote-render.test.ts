import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NoDaArvore } from "./AbaEap";

const no = {
  id: 1, code: "1.1", name: "Pacote de teste", level: 2, nodeType: "pacote", parentId: 9,
  externalId: null, unit: null, plannedQuantity: null, description: null, inclusions: null,
  exclusions: null, location: null, responsible: null, acceptanceCriteria: null,
  decompositionBasis: null, scopeStatus: "rascunho", sortOrder: 1,
};
const renderizar = (nodeType: string, jaNoCronograma: boolean) => renderToStaticMarkup(createElement(NoDaArvore, {
  ramo: { no: { ...no, nodeType }, filhos: [] }, abertos: new Set<number>(),
  onAlternar: () => {}, aoTrazer: () => {}, aoAdicionar: () => {}, aoEditar: () => {},
  modoRevisao: true, jaNoCronograma: () => jaNoCronograma, podeCriarAtividade: true,
  profundidade: 1, selecionadoId: null, aoSelecionar: () => {},
}));

describe("pacote terminal da EAP", () => {
  it("mostra o vínculo do pacote e não oferece adicionar filhos", () => {
    const html = renderizar("pacote", true);
    expect(html).toContain("No cronograma");
    expect(html).not.toContain("Adicionar item filho");
    expect(html).not.toContain('class="eap-grupo-label"');
  });
  it("oferece criar atividade para pacote e entrega, reservando decomposição aos grupos", () => {
    for (const tipo of ["pacote", "entrega"]) expect(renderizar(tipo, false)).toContain("+ Atividade");
    const grupo = renderizar("grupo", false);
    expect(grupo).toContain("Adicionar item filho");
    expect(grupo).not.toContain("+ Atividade");
  });
});
