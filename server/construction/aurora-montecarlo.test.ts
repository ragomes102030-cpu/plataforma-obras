import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateCpm, type CpmActivity, type Dependency } from "../../shared/cpm";
import { simulateMonteCarlo } from "../../shared/monte-carlo";

/**
 * Monte Carlo sobre o cronograma aprovado da AURORA TESTE (v3, id 8).
 *
 * O mesmo fixture do `aurora-cpm-golden.test.ts` serve de entrada real: 53
 * atividades e 64 dependências. Nenhuma escrita no banco, nenhuma migração —
 * a obra é lida do retrato já versionado.
 *
 * O que este teste protege:
 *  - o simulador continua determinístico com semente fixa (sem isso, p80 vira
 *    número de loteria e ninguém confia no painel);
 *  - os percentis continuam ordenados e coerentes com o CPM determinístico;
 *  - a rede desconectada continua sendo reportada. Na AURORA o prazo é o máximo
 *    entre 8 cadeias isoladas, não o caminho crítico de uma delas. Se essa
 *    detecção sumir, o painel passa a prometer um prazo que o dado não sustenta.
 */

interface Fixture {
  obra: string;
  codigo: string;
  projectId: number;
  versionId: number;
  capturadoEm: string;
  atividades: Array<{ id: string; duration: number }>;
  dependencias: Dependency[];
}

const fixture = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/aurora-v3-cpm.json", import.meta.url), "utf8")
) as Fixture;

function montarAtividades(): CpmActivity[] {
  return fixture.atividades.map(activity => ({ id: activity.id, duration: activity.duration }));
}

describe(`monte carlo: ${fixture.obra} (${fixture.codigo}) v${fixture.versionId}`, () => {
  const atividades = montarAtividades();
  const resultado = simulateMonteCarlo(atividades, fixture.dependencias, {
    iterations: 5000,
    seed: 20261021,
    uncertainty: 0.25,
  });

  it("roda sobre o cronograma aprovado inteiro", () => {
    expect(atividades).toHaveLength(53);
    expect(fixture.dependencias).toHaveLength(64);
    expect(resultado.iterations).toBe(5000);
  });

  it("reproduz o prazo determinístico do motor CPM", () => {
    const deterministico = calculateCpm(atividades, fixture.dependencias).projectDuration;
    expect(resultado.deterministicDuration).toBe(deterministico);
  });

  it("reporta a rede desconectada em vez de esconder", () => {
    // Medido no fixture dourado: 5 componentes (38/5/4/3/3 atividades), com
    // 0 atividades sem nenhuma dependência. O QA do projeto fala em "8 cadeias
    // isoladas" — número que não bate com a v3 aprovada. O fixture é a verdade
    // aqui; se a obra for recapturada, este valor muda e o diff aparece.
    expect(resultado.network.disconnected).toBe(true);
    expect(resultado.network.components).toBe(5);
    expect(resultado.network.isolatedActivities).toHaveLength(0);
  });

  it("mantém os percentis ordenados e acima do caso base", () => {
    expect(resultado.p10).toBeLessThanOrEqual(resultado.p50);
    expect(resultado.p50).toBeLessThanOrEqual(resultado.p80);
    expect(resultado.p80).toBeLessThanOrEqual(resultado.p90);
    // A distribuição é simétrica em torno da duração planejada, então a mediana
    // não pode cair muito abaixo do determinístico.
    expect(resultado.p50).toBeGreaterThanOrEqual(resultado.deterministicDuration * 0.95);
    expect(resultado.p80).toBeGreaterThan(resultado.p50);
  });

  it("é determinístico com a mesma semente", () => {
    const repetido = simulateMonteCarlo(atividades, fixture.dependencias, {
      iterations: 5000,
      seed: 20261021,
      uncertainty: 0.25,
    });
    expect(repetido.p50).toBe(resultado.p50);
    expect(repetido.p80).toBe(resultado.p80);
    expect(repetido.stdDev).toBe(resultado.stdDev);
  });

  it("produz índice de criticidade utilizável", () => {
    const valores = Object.values(resultado.criticalityIndex);
    expect(valores).toHaveLength(53);
    for (const valor of valores) {
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThanOrEqual(1);
    }
    // Pelo menos uma atividade precisa concentrar risco; se todas ficarem em
    // zero, o simulador não está marcando caminho crítico nenhum.
    expect(Math.max(...valores)).toBeGreaterThan(0.5);
  });

  it("ordena a sensibilidade pela correlação com o prazo", () => {
    expect(resultado.sensitivity).toHaveLength(53);
    const magnitudes = resultado.sensitivity.map(item => Math.abs(item.correlation));
    const ordenado = [...magnitudes].sort((a, b) => b - a);
    expect(magnitudes).toEqual(ordenado);
    expect(magnitudes[0]).toBeGreaterThan(0.1);
  });

  it("responde probabilidade de terminar até uma data", () => {
    expect(resultado.probabilityOfFinishingBy(resultado.p50)).toBeCloseTo(0.5, 1);
    expect(resultado.probabilityOfFinishingBy(resultado.p90)).toBeCloseTo(0.9, 1);
    expect(resultado.probabilityOfFinishingBy(resultado.deterministicDuration * 2)).toBe(1);
  });

  // Retrato para inspeção manual quando alguém mexer no simulador.
  it("registra o retrato simulado", () => {
    console.log(
      `[aurora monte carlo] determinístico=${resultado.deterministicDuration}d ` +
        `p50=${resultado.p50}d p80=${resultado.p80}d p90=${resultado.p90}d ` +
        `média=${resultado.mean.toFixed(1)}d sd=${resultado.stdDev.toFixed(1)}d ` +
        `cadeias=${resultado.network.components}`
    );
    expect(resultado.histogram.length).toBeGreaterThan(0);
  });
});
