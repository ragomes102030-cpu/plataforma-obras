import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Impede regressão para a primeira versão histórica ao montar o modelo que
 * alimenta o planejamento do agente. Numa obra com 6 versões, a primeira
 * pode não ter atividades nem orçamento e produzir orientação obsoleta.
 */
describe("modelo consolidado do Arquimedes — seleção de versões", () => {
  const model = readFileSync("shared/project-model.ts", "utf8");
  const versionSource = readFileSync("server/construction/plan-versions.ts", "utf8");

  it("usa versão do plano de maior número, como o serviço de versão corrente", () => {
    expect(versionSource).toContain(".orderBy(desc(projectPlanVersions.versionNumber))");
    expect(model).toContain(".orderBy(desc(schema.projectPlanVersions.versionNumber))");
    expect(model).toContain(".where(eq(schema.wbsNodes.versionId, versionId))");
    expect(model).toContain(".where(eq(schema.scheduleActivities.versionId, versionId))");
    expect(model).toContain(".where(eq(schema.scheduleDependencies.versionId, versionId))");
  });

  it("contexto orçamentário usa a última versão, sem se confundir com BAC aprovado de EVM", () => {
    expect(model).toContain(".orderBy(desc(schema.budgetVersions.versionNumber))");
    expect(model).toContain(".where(eq(schema.budgetItems.budgetVersionId, budgetVersion.id))");
    expect(model).toContain("não confundir com BAC/EVM");
  });

  it("não altera o projeto nem qualquer vínculo no banco", () => {
    expect(model).not.toMatch(/\.update\s*\(|\.delete\s*\(|\.insert\s*\(/);
  });
});
