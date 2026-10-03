import type { db as DbType } from "../db";
import { loadArquimedesBrainBootstrap } from "../agent/core/brain-context";
import { loadEapSkills } from "../agent/core/skill-loader";
import { buildArquimedesMemoryContext, recallArquimedes, rememberArquimedesLearning } from "../agent/memory";

type SuiteCheck = { id: string; passed: boolean; detail?: string };

export async function runBrainSkillsQaSuite(input: {
  ownerUserId: number;
  projectId: number;
}) {
  const checks: SuiteCheck[] = [];

  const bootstrap = await loadArquimedesBrainBootstrap();
  checks.push({
    id: "brain.bootstrap-loaded",
    passed: bootstrap.length > 200 && bootstrap.includes("Skill") && bootstrap.includes("Memória"),
    detail: `chars=${bootstrap.length}`,
  });

  const skills = await loadEapSkills();
  const review = skills.find(skill => skill.id.endsWith("revisao-engenheiro"));
  const learning = skills.find(skill => skill.id.endsWith("aprendizado-regressao"));

  checks.push({
    id: "skills.loaded",
    passed: skills.length >= 7 && Boolean(review) && Boolean(learning),
    detail: `count=${skills.length}`,
  });
  checks.push({
    id: "skill.independent-mode",
    passed: learning?.mode === "independente" && (learning?.mcpDependencies?.length ?? 0) === 0,
    detail: `mode=${learning?.mode ?? "missing"}`,
  });
  checks.push({
    id: "skill.hybrid-mcp-dependency",
    passed: review?.mode === "hibrida" && review?.mcpDependencies?.includes("eap") === true,
    detail: `mode=${review?.mode ?? "missing"};mcps=${review?.mcpDependencies?.join(",") ?? "none"}`,
  });

  const learningKey = "qa-brain-skills-learning";
  const saved = await rememberArquimedesLearning({
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    learningKey,
    problem: "Teste controlado do ciclo de aprendizado do Arquimedes.",
    evidence: [
      "QA determinístico executado no ambiente isolado ARQUIMEDES-QA.",
      "Registro criado pelo fluxo de aprendizado, sem aprovação humana.",
    ],
    rule: "Aprendizado novo deve permanecer como candidato/proposto até validação e aprovação.",
    regressionTest: "brain-skills-qa",
    scope: "project",
    confidence: "high",
    sourceRef: "qa:brain-skills",
  });

  const recalled = await recallArquimedes(
    input.ownerUserId,
    input.projectId,
    learningKey,
    5
  );
  const found = recalled.find(item => item.memoryKey === learningKey);
  checks.push({
    id: "learning.candidate-recorded",
    passed:
      Boolean(saved) &&
      saved.category === "aprendizado" &&
      saved.status === "proposed" &&
      typeof saved.valueJson === "string" &&
      saved.valueJson.includes('"lifecycle":"candidate"'),
    detail: `status=${saved?.status ?? "missing"}`,
  });
  checks.push({
    id: "learning.recalled",
    passed: Boolean(found) && found?.status === "proposed" && (found?.value as { lifecycle?: string })?.lifecycle === "candidate",
    detail: found ? `status=${found.status};lifecycle=${(found.value as { lifecycle?: string })?.lifecycle}` : "not recalled",
  });

  const context = await buildArquimedesMemoryContext(input.ownerUserId, input.projectId);
  checks.push({
    id: "learning.in-next-context",
    passed: context.includes(learningKey) && context.includes("candidate"),
    detail: `contextChars=${context.length}`,
  });

  const passedCount = checks.filter(check => check.passed).length;
  return {
    suite: "BRAIN_SKILLS_REGRESSION",
    status: passedCount === checks.length ? "passed" : "failed",
    projectId: input.projectId,
    checks,
    total: checks.length,
    passedCount,
    learning: {
      key: learningKey,
      status: saved?.status ?? null,
      lifecycle: "candidate",
      changesApplied: false,
    },
  };
}
