import { describe, expect, it } from "vitest";
import { indexarAtividadesPorCodigo, resolverAtividadeDaProducao } from "@shared/producao-vinculo";

describe("indexarAtividadesPorCodigo", () => {
  it("indexa as atividades atuais pelo código da EAP", () => {
    const indice = indexarAtividadesPorCodigo([
      { id: 10, wbsCode: "1.1.1" },
      { id: 11, wbsCode: "1.1.2" },
    ]);
    expect(indice.get("1.1.1")).toBe(10);
    expect(indice.get("1.1.2")).toBe(11);
  });

  it("descarta código vazio", () => {
    const indice = indexarAtividadesPorCodigo([{ id: 1, wbsCode: "  " }, { id: 2, wbsCode: null }]);
    expect(indice.size).toBe(0);
  });

  it("descarta código duplicado em vez de escolher um dos dois", () => {
    const indice = indexarAtividadesPorCodigo([
      { id: 1, wbsCode: "2.2" },
      { id: 2, wbsCode: "2.2" },
    ]);
    expect(indice.has("2.2")).toBe(false);
  });
});

describe("resolverAtividadeDaProducao", () => {
  const idsAtuais = new Set([100, 101]);
  const idPorCodigo = new Map([
    ["1.1.1", 100],
    ["1.2.3", 101],
  ]);

  it("usa o id quando ele existe no plano atual", () => {
    expect(resolverAtividadeDaProducao(101, "1.1.1", idsAtuais, idPorCodigo)).toBe(101);
  });

  it("reencontra pelo código quando o id é de versão anterior", () => {
    // O id 7 não existe mais; o código 1.2.3 aponta para a atividade 101.
    expect(resolverAtividadeDaProducao(7, "1.2.3", idsAtuais, idPorCodigo)).toBe(101);
  });

  it("mantém o id original quando o código também não existe no plano", () => {
    // O motor ignora o que está fora do escopo, mas o lançamento não desaparece.
    expect(resolverAtividadeDaProducao(7, "9.9.9", idsAtuais, idPorCodigo)).toBe(7);
  });

  it("devolve null só quando não há id nem código", () => {
    expect(resolverAtividadeDaProducao(null, null, idsAtuais, idPorCodigo)).toBeNull();
    expect(resolverAtividadeDaProducao(null, "   ", idsAtuais, idPorCodigo)).toBeNull();
  });

  it("aceita o id quando não há código no lançamento", () => {
    expect(resolverAtividadeDaProducao(100, null, idsAtuais, idPorCodigo)).toBe(100);
  });
});
