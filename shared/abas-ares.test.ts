import { describe, expect, it } from "vitest";
import {
  ABAS_DO_ARES,
  VISOES_LATERAIS,
  abaPorId,
  indiceParaAtalho,
} from "./abas-ares";

/**
 * A ordem das abas é contrato: quem abre a obra e quem lê a planilha precisam
 * ver a mesma sequência. Estes testes travam essa ordem e as regras de exibição.
 */

describe("abas da obra", () => {
  it("segue a ordem da planilha de referência", () => {
    expect(ABAS_DO_ARES.map(a => a.rotulo)).toEqual([
      "DASHBOARD",
      "RESUMO",
      "CRONOGRAMA",
      "GANTT",
      "MEDICOES",
      "PRODUCAO",
    ]);
  });

  it("tem identificador único e sem repetição", () => {
    const ids = ABAS_DO_ARES.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda aba pendente diz o que falta", () => {
    for (const aba of ABAS_DO_ARES) {
      if (aba.status !== "pendente") continue;
      expect(aba.falta, `aba ${aba.rotulo} está pendente e não diz o que falta`)
        .toBeTruthy();
      // Sem "em breve" genérico: a ausência tem que nomear o bloqueio.
      expect(aba.falta).not.toMatch(/em breve|brevemente|em construção/i);
    }
  });

  it("nenhuma aba pronta esconde o que falta", () => {
    // "pronta" sem `componenteExistente` significaria uma aba que promete
    // tela e não tem nada por trás.
    for (const aba of ABAS_DO_ARES) {
      if (aba.status !== "pronta") continue;
      expect(aba.componenteExistente, `aba ${aba.rotulo} pronta sem componente`)
        .toBeTruthy();
    }
  });

  it("CRONOGRAMA é a aba pronta e é o coração da planilha", () => {
    const crono = abaPorId("cronograma");
    expect(crono.rotulo).toBe("CRONOGRAMA");
    expect(crono.status).toBe("pronta");
  });

  it("desconhece aba que não existe e cai na primeira", () => {
    expect(abaPorId("inexistente").id).toBe(ABAS_DO_ARES[0]!.id);
  });
});

describe("visões da lateral", () => {
  it("tem Gantt e Linha de Balanço, e só eles", () => {
    expect(VISOES_LATERAIS.map(v => v.id)).toEqual(["gantt", "lob"]);
  });

  it("toda visão explica o que é", () => {
    for (const v of VISOES_LATERAIS) {
      expect(v.descricao).toBeTruthy();
    }
  });

  it("Linha de Balanço não é aba, e sim a visão semanal do mesmo cronograma", () => {
    // Se virasse aba, a mesma lista de atividades apareceria duas vezes em
    // escalas diferentes — duplicação de fonte, que é o que a casca anterior
    // fazia.
    expect(ABAS_DO_ARES.some(a => a.id === "lob")).toBe(false);
    expect(VISOES_LATERAIS.some(v => v.id === "lob")).toBe(true);
  });
});

describe("atalhos", () => {
  it("numera a partir de 1 como a planilha", () => {
    expect(indiceParaAtalho(0)).toBe("1");
    expect(indiceParaAtalho(5)).toBe("6");
  });

  it("não chega na décima aba: são seis, como a planilha", () => {
    // A planilha tem seis abas, então o Ctrl+0 não mapeia para nada aqui. O
    // teste antigo assumia as dezoito e passava por acidente.
    expect(indiceParaAtalho(6)).toBe("–");
    expect(indiceParaAtalho(9)).toBe("–");
  });

  it("não inventa atalho fora da faixa", () => {
    expect(indiceParaAtalho(-1)).toBe("–");
    expect(indiceParaAtalho(99)).toBe("–");
  });
});
