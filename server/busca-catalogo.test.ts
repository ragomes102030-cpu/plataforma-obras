import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { escaparCuringaLike, termoDeBusca } from "@shared/busca";

/**
 * O catálogo abria em ~11 s baixando 5,29 MB (12.077 itens + 4.436 composições)
 * e montando 12 mil <option>. Estes testes travam a correção: busca no servidor,
 * listas paginadas e nada de negar a existência do que existe.
 */

const ROUTERS = readFileSync("server/routers.ts", "utf-8");
const VIEW = readFileSync("client/src/components/CatalogView.tsx", "utf-8");

function blocoDoCatalogo(): string {
  const inicio = ROUTERS.indexOf("catalog: router({");
  const fim = ROUTERS.indexOf("    searchPrices:", inicio);
  expect(inicio).toBeGreaterThan(-1);
  return ROUTERS.slice(inicio, fim === -1 ? undefined : fim);
}

describe("escaparCuringaLike", () => {
  it("embrulha o termo em curingas", () => {
    expect(escaparCuringaLike("cimento")).toBe("%cimento%");
  });

  it("trata % e _ digitados como texto literal", () => {
    expect(escaparCuringaLike("50%")).toBe("%50\\%%");
    expect(escaparCuringaLike("TUBO_100")).toBe("%TUBO\\_100%");
  });

  it("escapa a própria barra invertida antes dos curingas", () => {
    expect(escaparCuringaLike("a\\b")).toBe("%a\\\\b%");
  });

  it("devolve %% para termo vazio (lista completa)", () => {
    expect(escaparCuringaLike("")).toBe("%%");
  });
});

describe("termoDeBusca", () => {
  it("remove espaços nas pontas", () => {
    expect(termoDeBusca("  areia ")).toBe("areia");
  });

  it("trata vazio, só espaços e nulo como ausência de busca", () => {
    expect(termoDeBusca("")).toBeUndefined();
    expect(termoDeBusca("   ")).toBeUndefined();
    expect(termoDeBusca(null)).toBeUndefined();
    expect(termoDeBusca(undefined)).toBeUndefined();
  });
});

describe("catalog.list não devolve a base inteira", () => {
  const bloco = blocoDoCatalogo();

  it("aplica limite na lista de itens", () => {
    expect(bloco).toContain(".limit(limiteItens)");
  });

  it("aplica limite na lista de composições", () => {
    expect(bloco).toContain(".limit(limiteComposicoes)");
  });

  it("conta o total no banco para exibir 'X de Y'", () => {
    expect(bloco).toContain("count(*)::int");
    expect(bloco).toContain("totalItems");
    expect(bloco).toContain("totalCompositions");
  });

  it("busca com ILIKE usando o termo escapado", () => {
    expect(bloco).toContain("ILIKE ${padrao}");
    expect(bloco).toContain("ILIKE ${padraoComposicoes}");
    expect(bloco).toContain("escaparCuringaLike(");
  });

  it("não guarda no cache uma chave por termo digitado", () => {
    expect(bloco).toContain("if (!termo && !termoComposicoes) cacheSet(");
  });
});

describe("tela do catálogo usa a busca do servidor", () => {
  it("envia q e qCompositions na consulta", () => {
    expect(VIEW).toContain("q: buscaDebounced || undefined");
    expect(VIEW).toContain("qCompositions: buscaComposicaoDebounced || undefined");
  });

  it("mostra 'N de M' em vez de somar o preço unitário de uma página", () => {
    expect(VIEW).toContain("catalog-paginacao");
    expect(VIEW).toContain("totalItens");
    expect(VIEW).not.toContain("group.list.reduce((sum, item) => sum + Number(item.unitPrice), 0)");
  });

  it("não monta um <option> por item da base", () => {
    expect(VIEW).not.toContain("(catalogQuery.data?.priceItems ?? []).map(item => <option");
  });

  it("o seletor de item do componente usa a busca de preços", () => {
    expect(VIEW).toContain("componentesSugeridos.data?.candidates");
  });
});
