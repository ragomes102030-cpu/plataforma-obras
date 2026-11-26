import { describe, expect, it } from "vitest";
import {
  avaliarSituacaoCurva,
  calcularProgressoRealPorCodigo,
} from "./curva-realizado";

describe("progresso real da Curva S", () => {
  it("ignora premissas QA, rascunhos e unidades incompatíveis", () => {
    const progresso = calcularProgressoRealPorCodigo(
      [
        { codigo: "1.2.1", quantidade: 100, status: "confirmada", exemplo: 1, unidadeCompativel: true },
        { codigo: "1.2.1", quantidade: 80, status: "rascunho", exemplo: 0, unidadeCompativel: true },
        { codigo: "1.2.1", quantidade: 70, status: "confirmada", exemplo: 0, unidadeCompativel: false },
        { codigo: "1.2.1", quantidade: 40, status: "confirmada", exemplo: 0, unidadeCompativel: true },
      ],
      [{ codigo: "1.2.1", planejado: 100 }],
    );

    expect(progresso.get("1.2.1")).toBe(40);
  });

  it("limita a 100% e não inventa percentual sem quantidade planejada ou medição", () => {
    const progresso = calcularProgressoRealPorCodigo(
      [
        { codigo: "1.2.1", quantidade: 150, status: "confirmada", exemplo: 0, unidadeCompativel: true },
        { codigo: "1.2.2", quantidade: 10, status: "confirmada", exemplo: 0, unidadeCompativel: true },
      ],
      [
        { codigo: "1.2.1", planejado: 100 },
        { codigo: "1.2.2", planejado: 0 },
        { codigo: "1.2.3", planejado: 50 },
      ],
    );

    expect(progresso.get("1.2.1")).toBe(100);
    expect(progresso.has("1.2.2")).toBe(false);
    expect(progresso.has("1.2.3")).toBe(false);
  });
});

describe("situação da Curva S sem execução real", () => {
  it("não chama a obra de adiantada ou no prazo sem medição real", () => {
    expect(avaliarSituacaoCurva({
      antesDoInicio: false,
      temRealizadoAteHoje: false,
      planejado: 0,
      realizado: 0,
    })).toEqual({ status: "sem_medicao", desvio: null });
  });

  it("só compara prazo quando existe produção real confirmada", () => {
    expect(avaliarSituacaoCurva({
      antesDoInicio: false,
      temRealizadoAteHoje: true,
      planejado: 0,
      realizado: 0.3,
    })).toEqual({ status: "no_prazo", desvio: 0.3 });
  });

  it("mantém obra ainda não iniciada como estado próprio", () => {
    expect(avaliarSituacaoCurva({
      antesDoInicio: true,
      temRealizadoAteHoje: false,
      planejado: 0,
      realizado: 0,
    })).toEqual({ status: "antes_do_inicio", desvio: null });
  });
});
