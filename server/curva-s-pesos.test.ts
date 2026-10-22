import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calcularPesosDaCurva } from "../client/src/lib/curva-s-pesos";

/**
 * PESO DE CUSTO DA CURVA S — o vínculo entre orçamento e cronograma.
 *
 * Descoberto na AURORA TESTE em 22/10/2026: a curva S abria vazia com a
 * mensagem "o valor do orçamento não chegou às atividades", quando na verdade
 * os 53 itens do orçamento estavam ligados aos nós da versão ANTERIOR da EAP
 * (mesmos códigos, ids novos). O valor existia, só não casava por id.
 */

const atividade = (id: number, wbsCode: string, wbsNodeId: number | null) => ({
  id,
  wbsCode,
  wbsNodeId,
});

const item = (
  code: string,
  wbsNodeId: number | null,
  quantidade: number,
  preco: number
) => ({ code, wbsNodeId, quantity: quantidade, unitPrice: preco });

describe("pesos da curva S", () => {
  it("soma o custo dos itens na atividade do mesmo pacote", () => {
    const resultado = calcularPesosDaCurva(
      [atividade(1, "1.1", 10), atividade(2, "1.2", 11)],
      [item("1.1", 10, 2, 100), item("1.1", 10, 1, 50), item("1.2", 11, 3, 10)]
    );

    expect(resultado.custoPorAtividade.get(1)).toBe(250);
    expect(resultado.custoPorAtividade.get(2)).toBe(30);
    expect(resultado.total).toBe(280);
    expect(resultado.valorSemDestino).toBe(0);
  });

  it("casa pelo código quando o item aponta para o nó de outra versão da EAP", () => {
    // O orçamento guarda wbsNodeId da versão antiga (999); a atividade atual
    // está no nó 10. O código 1.2.3 é o mesmo pacote nas duas versões.
    const resultado = calcularPesosDaCurva(
      [atividade(7, "1.2.3", 10)],
      [item("1.2.3", 999, 1, 5000)]
    );

    expect(resultado.custoPorAtividade.get(7)).toBe(5000);
    expect(resultado.valorSemDestino).toBe(0);
    expect(resultado.itensCasadosPorCodigo).toBe(1);
  });

  it("não esconde dinheiro que ficou sem destino", () => {
    const resultado = calcularPesosDaCurva(
      [atividade(1, "1.1", 10)],
      [item("1.1", 10, 1, 100), item("9.9", 555, 1, 400)]
    );

    expect(resultado.valorSemDestino).toBe(400);
    expect(resultado.itensSemDestino).toBe(1);
  });

  it("ignora item sem quantidade ou preço em vez de zerar a curva inteira", () => {
    const resultado = calcularPesosDaCurva(
      [atividade(1, "1.1", 10), atividade(2, "1.2", 11)],
      [item("1.1", 10, "2", "50.5"), item("1.2", 11, 1, 0)]
    );

    expect(resultado.total).toBe(101);
    expect(resultado.custoPorAtividade.has(2)).toBe(false);
  });

  it("não quebra quando atividade ou item vêm sem código e sem nó", () => {
    const resultado = calcularPesosDaCurva(
      [{ id: 1, wbsCode: null, wbsNodeId: null }],
      [{ code: null, wbsNodeId: null, quantity: 1, unitPrice: 10 }]
    );

    expect(resultado.custoPorAtividade.size).toBe(0);
    expect(resultado.valorSemDestino).toBe(10);
  });
});

/**
 * O CABEÇALHO DA CURVA S COMPARA COM HOJE, NÃO COM O FIM DA OBRA.
 *
 * `curve.deviation` é o desvio no último dia do cronograma. Usá-lo no cartão
 * fazia toda obra sem execução nascer "Obra atrasada" com -100% — inclusive
 * antes da data de início. Visto na AURORA em 22/10/2026: planejado 0%,
 * realizado 0%, desvio -89,3%, "Obra atrasada".
 */
describe("cabeçalho da curva S", () => {
  const FONTE = readFileSync("client/src/components/AbaCurvaS.tsx", "utf-8");

  it("calcula o desvio a partir do ponto de hoje", () => {
    expect(FONTE).toContain("pontoHoje.actual - pontoHoje.planned");
    expect(FONTE).not.toContain("const desvio = curve.deviation");
  });

  it("não chama de atrasada uma obra que ainda não começou", () => {
    expect(FONTE).toContain("aindaNaoComecou");
    expect(FONTE).toContain("Obra ainda não começou");
    expect(FONTE).toContain("não existe atraso antes de a obra começar");
  });
});
