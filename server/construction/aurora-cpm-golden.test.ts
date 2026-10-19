import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateCpm, type CpmActivity, type Dependency } from "../../shared/cpm";

/**
 * Conjunto dourado da AURORA TESTE (v3 aprovada, id 8).
 *
 * O fixture e um retrato do cronograma real: duracoes, relacoes e o resultado
 * CPM persistido na ultima calculacao. O teste recomputa do zero e compara com
 * o que esta gravado. Serve para duas coisas:
 *
 * 1. regressao do motor — qualquer mudanca de regra que altere datas, folgas ou
 *    caminho critico aparece aqui antes de chegar em producao;
 * 2. coerencia do banco — se o cronograma salvo ficar velho em relacao ao
 *    motor, o teste acusa, em vez de o engenheiro descobrir na reuniao.
 *
 * Atualizar o fixture e um ato deliberado: exportar de novo da Aurora e revisar
 * o diff. Nunca "consertar" o esperado para o teste passar.
 */

interface Fixture {
  obra: string;
  codigo: string;
  projectId: number;
  versionId: number;
  capturadoEm: string;
  atividades: Array<{
    id: string;
    duration: number;
    esperado: {
      earlyStart: number;
      earlyFinish: number;
      lateStart: number;
      lateFinish: number;
      totalFloat: number;
      freeFloat: number;
      critical: boolean;
    };
  }>;
  dependencias: Dependency[];
}

const fixture = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/aurora-v3-cpm.json", import.meta.url), "utf8")
) as Fixture;

function montarAtividades(): CpmActivity[] {
  return fixture.atividades.map(a => ({ id: a.id, duration: a.duration }));
}

describe(`conjunto dourado: ${fixture.obra} (${fixture.codigo}) v${fixture.versionId}`, () => {
  it("o fixture cobre o cronograma aprovado inteiro", () => {
    expect(fixture.atividades).toHaveLength(53);
    expect(fixture.dependencias).toHaveLength(64);
    expect(new Set(fixture.atividades.map(a => a.id)).size).toBe(53);
  });

  it("nao tem dependencia orfa nem laco", () => {
    const ids = new Set(fixture.atividades.map(a => a.id));
    for (const d of fixture.dependencias) {
      expect(ids.has(d.predecessorId)).toBe(true);
      expect(ids.has(d.successorId)).toBe(true);
      expect(d.predecessorId).not.toBe(d.successorId);
    }
  });

  it("recomputa exatamente as datas, folgas e o critico persistidos", () => {
    const result = calculateCpm(montarAtividades(), fixture.dependencias);
    expect(result.infeasibleActivities).toEqual([]);

    const porId = new Map(result.activities.map(a => [a.id, a]));
    for (const esperada of fixture.atividades) {
      const calculada = porId.get(esperada.id);
      expect(calculada, `atividade ${esperada.id} ausente no resultado`).toBeDefined();
      expect(
        {
          earlyStart: calculada!.earlyStart,
          earlyFinish: calculada!.earlyFinish,
          lateStart: calculada!.lateStart,
          lateFinish: calculada!.lateFinish,
          totalFloat: calculada!.totalFloat,
          freeFloat: calculada!.freeFloat,
          critical: calculada!.critical,
        },
        `divergencia na atividade ${esperada.id}`
      ).toEqual(esperada.esperado);
    }
  });

  it("e deterministico e respeita a duracao total", () => {
    const primeira = calculateCpm(montarAtividades(), fixture.dependencias);
    const segunda = calculateCpm(montarAtividades(), fixture.dependencias);
    expect(segunda).toEqual(primeira);

    const maiorTermino = Math.max(...primeira.activities.map(a => a.earlyFinish));
    expect(primeira.projectDuration).toBe(maiorTermino);
    expect(primeira.projectDuration).toBeGreaterThan(0);
    expect(primeira.criticalPath.length).toBeGreaterThan(0);
  });
});
