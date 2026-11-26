import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FONTE = readFileSync("client/src/components/AbaCurvaS.tsx", "utf-8");

describe("Curva S financeira sem contaminar o avanço real", () => {
  it("usa produção confirmada, unidade compatível e exclui exemplos QA", () => {
    expect(FONTE).toContain("selectConfirmedProductionEntries");
    expect(FONTE).toContain("unidadeCompativel === true");
  });

  it("não usa o percentual persistido de uma atividade como fonte de execução real", () => {
    expect(FONTE).not.toContain("actualPercent: a.progress ?? 0");
    expect(FONTE).not.toContain("<td>{a.progress ?? 0}%</td>");
    expect(FONTE).toContain("calcularProgressoRealPorCodigo");
  });

  it("não classifica uma curva sem medição como adiantada ou no prazo", () => {
    expect(FONTE).toContain("avaliarSituacaoCurva");
    expect(FONTE).toContain("Sem dado");
    expect(FONTE).toContain("sem medição real confirmada");
  });

  it("explica como continuar o planejamento quando não há orçamento", () => {
    expect(FONTE).toContain("Curva S financeira indisponível");
    expect(FONTE).toContain("Cronograma");
    expect(FONTE).toContain("orçamento é opcional para planejar o prazo");
  });
});
