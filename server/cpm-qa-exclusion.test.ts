import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync("server/routers.ts", "utf8");
const abaCpm = readFileSync("client/src/components/AbaCpm.tsx", "utf8");
const abaBaseline = readFileSync("client/src/components/AbaBaseline.tsx", "utf8");

function corpoDaRota(nome: string, proximaRota: string): string {
  const inicio = router.indexOf(`${nome}: protectedProcedure`);
  expect(inicio, `${nome} não existe no router`).toBeGreaterThan(-1);
  const fim = router.indexOf(`${proximaRota}: protectedProcedure`, inicio + 1);
  expect(fim, `${proximaRota} não existe depois de ${nome}`).toBeGreaterThan(inicio);
  return router.slice(inicio, fim);
}

describe("isolamento de QA no CPM operacional", () => {
  it.each([
    ["calculateCpmLocal", "calculateCpm"],
    ["calculateCpm", "simulateScheduleRisk"],
  ])("%s passa atividades e dependências pelo filtro operacional", (rota, proxima) => {
    const corpo = corpoDaRota(rota, proxima);
    expect(corpo).toContain("selectOperationalPlanning(");
    expect(corpo).toContain("planejamentoOperacional.activities");
    expect(corpo).toContain("planejamentoOperacional.dependencies");
    expect(corpo).toContain("atividadesExemploExcluidas:");
    expect(corpo).toContain("dependenciasExemploExcluidas:");
  });

  it("CPM e gate de baseline da interface compartilham a seleção operacional", () => {
    expect(abaCpm).toContain("selectOperationalPlanning(allActivities, allDependencies)");
    expect(abaBaseline).toContain("selectOperationalPlanning(todasAtividades, todasDependencias)");
    expect(abaCpm).toContain("Referências realmente ausentes continuam sendo validadas como erro.");
  });
});
