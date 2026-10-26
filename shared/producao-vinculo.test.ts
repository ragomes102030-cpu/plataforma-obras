import { describe, expect, it } from "vitest";
import {
  indexarAtividadesPorCodigo,
  resolverAtividadeDaProducao,
} from "./producao-vinculo";

/**
 * Regressão da Aurora: os lançamentos de produção de versões anteriores da
 * EAP continuam pertencendo ao serviço atual do mesmo código, mas não podem
 * ser associados arbitrariamente quando o código está duplicado.
 *
 * O corte temporal do planning.control acontece no SQL com productionDate <= asOf,
 * igual ao EVM; a reconciliação é validada aqui como função pura.
 */
describe("vínculo de produção entre versões de EAP", () => {
  const atuais = [
    { id: 101, wbsCode: "1.2.3" },
    { id: 102, wbsCode: "1.2.4" },
  ];
  const idsAtuais = new Set(atuais.map(a => a.id));
  const indice = indexarAtividadesPorCodigo(atuais);

  it("prioriza o identificador da atividade da versão atual", () => {
    expect(resolverAtividadeDaProducao(101, "1.2.4", idsAtuais, indice)).toBe(101);
  });

  it("recupera pelo código EAP um lançamento ligado à versão anterior", () => {
    const lancamentos = [
      { activityId: 5, codigoEap: "1.2.3", quantity: 7 },
      { activityId: 101, codigoEap: "1.2.3", quantity: 3 },
    ];
    const quantidades = new Map<number, number>();
    for (const entry of lancamentos) {
      const id = resolverAtividadeDaProducao(
        entry.activityId, entry.codigoEap, idsAtuais, indice
      );
      if (id != null) quantidades.set(id, (quantidades.get(id) ?? 0) + entry.quantity);
    }
    expect(quantidades.get(101)).toBe(10);
    expect(quantidades.has(5)).toBe(false);
  });

  it("não adivinha o destino quando o código EAP está duplicado", () => {
    const repetidas = indexarAtividadesPorCodigo([
      { id: 101, wbsCode: "1.2.3" },
      { id: 103, wbsCode: "1.2.3" },
    ]);
    expect(repetidas.has("1.2.3")).toBe(false);
    expect(resolverAtividadeDaProducao(5, "1.2.3", idsAtuais, repetidas)).toBe(5);
  });
});
