import { describe, expect, it } from "vitest";
import { linhasVisiveis, montarArvore } from "./gantt-arvore";
import type { EntradaDaLinha } from "./cronograma-colunas";
import type { IsoDate } from "./work-calendar";

function entrada(codigo: string, inicio: string, duracao: number, extra: Partial<EntradaDaLinha> = {}): EntradaDaLinha {
  return {
    codigo,
    atividade: `Atividade ${codigo}`,
    frente: "Execução",
    pavimento: null,
    inicio: inicio as IsoDate,
    duracao,
    quantidade: 10,
    unidade: "m2",
    executado: 0,
    ...extra,
  };
}

describe("montarArvore", () => {
  it("cria as etapas intermediárias que não existem como atividade", () => {
    const arvore = montarArvore([entrada("1.13.2", "2026-10-01", 3)]);
    expect(arvore).toHaveLength(1);
    expect(arvore[0]!.codigo).toBe("1");
    expect(arvore[0]!.temFilhos).toBe(true);
    expect(arvore[0]!.nome).toBe("Etapa 1");
    expect(arvore[0]!.filhos[0]!.codigo).toBe("1.13");
    expect(arvore[0]!.filhos[0]!.filhos[0]!.codigo).toBe("1.13.2");
  });

  it("ordena numericamente, não como texto (1.9 antes de 1.10)", () => {
    const arvore = montarArvore([entrada("1.10", "2026-10-01", 2), entrada("1.9", "2026-10-01", 2)]);
    const filhos = arvore[0]!.filhos.map(no => no.codigo);
    expect(filhos).toEqual(["1.9", "1.10"]);
  });

  it("agrega início, fim e duração de etapa pelo intervalo coberto", () => {
    const arvore = montarArvore([
      entrada("1.1", "2026-10-01", 3),
      entrada("1.2", "2026-10-10", 4),
    ]);
    const etapa = arvore[0]!;
    expect(etapa.inicio).toBe("2026-10-01");
    expect(etapa.fim).toBe("2026-10-13");
    // 01/10 a 13/10 = 13 dias corridos; soma das durações seria 7.
    expect(etapa.duracao).toBe(13);
  });

  it("pondera o avanço da etapa pela quantidade de cada atividade", () => {
    const arvore = montarArvore([
      entrada("1.1", "2026-10-01", 2, { quantidade: 100, executado: 100 }),
      entrada("1.2", "2026-10-03", 2, { quantidade: 300, executado: 0 }),
    ]);
    expect(arvore[0]!.progresso).toBeCloseTo(25, 5);
  });

  it("marca a etapa como crítica quando qualquer atividade dela é crítica", () => {
    const arvore = montarArvore(
      [entrada("1.1", "2026-10-01", 2), entrada("1.2", "2026-10-03", 2)],
      new Set(["1.2"])
    );
    expect(arvore[0]!.critica).toBe(true);
    expect(arvore[0]!.filhos[0]!.critica).toBe(false);
    expect(arvore[0]!.filhos[1]!.critica).toBe(true);
  });

  it("não divide por zero quando nenhuma atividade tem quantidade", () => {
    const arvore = montarArvore([
      entrada("1.1", "2026-10-01", 2, { quantidade: null, executado: 0 }),
      entrada("1.2", "2026-10-03", 2, { quantidade: null, executado: 0 }),
    ]);
    expect(Number.isFinite(arvore[0]!.progresso)).toBe(true);
    expect(arvore[0]!.progresso).toBe(0);
  });

  it("aceita código sem ponto e mantém como raiz", () => {
    const arvore = montarArvore([entrada("7", "2026-10-01", 1)]);
    expect(arvore[0]!.codigo).toBe("7");
    expect(arvore[0]!.temFilhos).toBe(false);
    expect(arvore[0]!.duracao).toBe(1);
  });

  it("não deixa atividade órfã quando o pai também é atividade", () => {
    const arvore = montarArvore([entrada("2", "2026-10-01", 5), entrada("2.1", "2026-10-02", 2)]);
    expect(arvore).toHaveLength(1);
    expect(arvore[0]!.linha).not.toBeNull();
    expect(arvore[0]!.temFilhos).toBe(true);
    expect(arvore[0]!.filhos[0]!.linha).not.toBeNull();
  });

  it("trata marco como ponto: começa e termina no mesmo dia", () => {
    const arvore = montarArvore([entrada("1.1", "2026-10-10", 5, { marco: true })]);
    const marco = arvore[0]!.filhos[0]!;
    expect(marco.marco).toBe(true);
    expect(marco.inicio).toBe("2026-10-10");
    expect(marco.fim).toBe("2026-10-10");
    // A duração continua 1 (mínimo do banco/CPM); quem achata é o desenho.
    expect(marco.duracao).toBe(1);
  });

  it("não estica a etapa por causa da duração lançada de um marco", () => {
    const arvore = montarArvore([
      entrada("1.1", "2026-10-01", 2),
      entrada("1.2", "2026-10-10", 30, { marco: true }),
    ]);
    expect(arvore[0]!.fim).toBe("2026-10-10");
  });
  it("usa o término real em dias úteis sem alterar duração cadastrada", () => {
    const arvore=montarArvore([
      entrada("1.1","2026-10-23",2),
      entrada("1.2","2026-10-26",2),
    ],new Set(),{"1.1":"2026-10-26","1.2":"2026-10-29"});
    expect(arvore[0]!.filhos[0]).toMatchObject({
      inicio:"2026-10-23",fim:"2026-10-26",duracao:2,
    });
    expect(arvore[0]!.filhos[1]!.fim).toBe("2026-10-29");
    expect(arvore[0]!.fim).toBe("2026-10-29");
    expect(arvore[0]!.duracao).toBe(7);
  });
  it("não aceita término oficial inválido, anterior ao início ou de marco",()=>{
    const arvore=montarArvore([
      entrada("1.1","2026-11-05",3),
      entrada("1.2","2026-11-08",10,{marco:true}),
    ],new Set(),{"1.1":"2026-11-02","1.2":"2026-12-30"});
    expect(arvore[0]!.filhos[0]!.fim).toBe("2026-11-07");
    expect(arvore[0]!.filhos[1]!.fim).toBe("2026-11-08");
  });

});

describe("linhasVisiveis", () => {
  const arvore = montarArvore([
    entrada("1.1", "2026-10-01", 2),
    entrada("1.2", "2026-10-03", 2),
    entrada("2.1", "2026-10-05", 2),
  ]);

  it("mostra etapa e atividades quando nada está recolhido", () => {
    expect(linhasVisiveis(arvore, new Set()).map(no => no.codigo)).toEqual([
      "1",
      "1.1",
      "1.2",
      "2",
      "2.1",
    ]);
  });

  it("esconde os filhos da etapa recolhida e mantém a etapa", () => {
    expect(linhasVisiveis(arvore, new Set(["1"])).map(no => no.codigo)).toEqual(["1", "2", "2.1"]);
  });

  it("recolher todas as etapas deixa só as raízes", () => {
    const todas = new Set(arvore.filter(no => no.temFilhos).map(no => no.chave));
    expect(linhasVisiveis(arvore, todas).map(no => no.codigo)).toEqual(["1", "2"]);
  });
});
