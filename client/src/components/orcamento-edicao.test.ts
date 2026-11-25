import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("edição do orçamento didático", () => {
  const source = readFileSync("client/src/components/AbaOrcamento.tsx", "utf8");

  it("oferece edição explícita por linha e persiste pela rota protegida", () => {
    expect(source).toContain("trpc.budgets.updateItem.useMutation");
    expect(source).toContain("Editar");
    expect(source).toContain("Salvar");
    expect(source).toContain("Preço unitário do item");
    expect(source).toContain("Referência do preço");
    expect(source).toContain("Quantidade do item");
    expect(source).toContain("Buscar composição oficial");
    expect(source).toContain("Composição analítica vinculada");
    expect(source).toContain("compositionId: rascunho.compositionId ? Number(rascunho.compositionId) : undefined");
    expect(source).toContain("mapCompositionComponentsForEditor(");
    expect(source).toContain("buscaComposicaoDebounced.length >= 2 || Boolean(rascunho.compositionId)");
    expect(source).toContain("Evidência do quantitativo");
    expect(source).toContain("Situação do quantitativo");
    expect(source).toContain("Pacote EAP associado");
    expect(source).toContain("wbsNodeId: Number(rascunho.wbsNodeId)");
    expect(source).toContain("quantityEvidenceStatus: rascunho.quantityEvidenceStatus");
    expect(source).toContain("referencePeriod: rascunho.referencePeriod || null");
    expect(source).toContain("compositionId: rascunho.compositionId ? Number(rascunho.compositionId) : null");
  });

  it("permite abrir uma revisão editável sem alterar a versão aprovada", () => {
    expect(source).toContain("trpc.budgets.createReviewVersion.useMutation");
    expect(source).toContain("Criar revisão para continuar os vínculos");
    expect(source).toContain("A versão aprovada será preservada e não será alterada.");
  });

  it("permite reabrir a mesma versão aprovada para correções com aviso sobre os indicadores", () => {
    expect(source).toContain("Reabrir esta versão para correções");
    expect(source).toContain("Nenhuma nova versão será criada.");
    expect(source).toContain("approvedForCurve.invalidate");
  });

  it("mostra o motivo quando a gravação de um item falha", () => {
    expect(source).toContain("atualizarItem.isError");
    expect(source).toContain("role=\"alert\">{atualizarItem.error.message}</p>");
  });

  it("mostra exceções documentadas com a mesma regra de rastreabilidade da aprovação", () => {
    expect(source).toContain("hasDocumentedPriceException(item)");
    expect(source).toContain("Exceção de preço rastreável");
  });

  it("revalida a conciliação atividade-orçamento após editar um item", () => {
    expect(source).toContain("utils.planning.conciliacao.invalidate({ projectId: Number(projetoId) })");
    expect(source).toContain("utils.budgets.reconcilePreview.invalidate({ projectId: Number(projetoId) })");
  });
});
