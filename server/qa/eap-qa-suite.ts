import { and, eq, isNull } from "drizzle-orm";
import { projects, scheduleActivities } from "../../drizzle/schema";
import { notFound, badRequest } from "../_core/errors";
import { buildAgentProjectContext } from "../agent/context-builder";
import {
  getAgentExecutionStatus,
  isAgentRunTerminal,
  startAgentExecution,
} from "../agent-execution";

type RunDb = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

type Check = {
  id: string;
  status: "passed" | "failed";
  detail: string;
};

function walk(value: unknown, visit: (key: string, value: unknown) => void, key = "") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, String(index)));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [childKey, childValue] of Object.entries(value)) {
    visit(childKey, childValue);
    walk(childValue, visit, childKey);
  }
}

function collectContractChecks(result: unknown): Check[] {
  const checks: Check[] = [];
  let resolutionTooLong = 0;
  let descriptionTooLong = 0;
  walk(result, (key, value) => {
    if (key === "resolutionSummary" && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.length > 600) resolutionTooLong += 1;
      }
    }
    if (key === "descricao" && typeof value === "string" && value.length > 4000) {
      descriptionTooLong += 1;
    }
    if (key === "description" && typeof value === "string" && value.length > 4000) {
      descriptionTooLong += 1;
    }
  });
  checks.push({
    id: "resolutionSummary.max600",
    status: resolutionTooLong === 0 ? "passed" : "failed",
    detail: resolutionTooLong === 0
      ? "Todos os itens encontrados respeitam <= 600 caracteres."
      : `${resolutionTooLong} item(ns) excedem 600 caracteres.`,
  });
  checks.push({
    id: "descricao.max4000",
    status: descriptionTooLong === 0 ? "passed" : "failed",
    detail: descriptionTooLong === 0
      ? "Nenhuma descrição encontrada excede 4000 caracteres."
      : `${descriptionTooLong} descrição(ões) excedem 4000 caracteres.`,
  });
  return checks;
}

export async function runEapQaSuite(args: {
  db: RunDb;
  projectId: number;
  userId: number;
  mcpProjectIds?: Partial<Record<"eap" | "cronograma" | "ganttLob", string>>;
}) {
  const [project] = await args.db.select().from(projects)
    .where(and(eq(projects.id, args.projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) throw notFound("Obra QA não encontrada.");

  const qaName = `${project.code ?? ""} ${project.name ?? ""}`.toUpperCase();
  if (!qaName.includes("QA")) {
    throw badRequest("A suíte EAP só pode executar em uma obra identificada como QA.");
  }

  const activities = await args.db.select().from(scheduleActivities)
    .where(eq(scheduleActivities.projectId, args.projectId));

  const coordinator = undefined;
  const started = await startAgentExecution({
    db: args.db,
    projectId: args.projectId,
    userId: args.userId,
    context: buildAgentProjectContext(project, activities, {
      activeSection: "eap",
      contextMode: "focused",
    }, coordinator),
    messages: [{
      role: "user",
      content: [
        "EXECUTE DIAGNÓSTICO EAP QA.",
        "Modo estritamente READ_ONLY: não aplicar, criar, atualizar, mover ou remover nenhum nó.",
        "Analise o contrato da EAP, a proposta estruturada e os limites de payload.",
        "Informe problemas encontrados e não trate texto como aprovação.",
        "Ao finalizar, deixe explícito se changesApplied=false.",
      ].join(" "),
    }],
    mcpProjectIds: args.mcpProjectIds ?? {},
  });

  const deadline = Date.now() + 90_000;
  let status = await getAgentExecutionStatus(args.db, started.requestId, args.userId);
  while (status && !isAgentRunTerminal(status.status) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    status = await getAgentExecutionStatus(args.db, started.requestId, args.userId);
  }

  const checks: Check[] = [
    {
      id: "execution.terminal",
      status: status && isAgentRunTerminal(status.status) ? "passed" : "failed",
      detail: status ? `status=${status.status}` : "execução não localizada",
    },
    {
      id: "execution.no-error",
      status: status?.errorCode ? "failed" : "passed",
      detail: status?.errorCode ? `${status.errorCode}: ${status.errorMessage ?? ""}` : "sem erro classificado",
    },
  ];

  if (status?.result) {
    checks.push(...collectContractChecks(status.result));
    const resultAny = status.result as unknown as Record<string, unknown>;
    const readOnly = resultAny.readOnly === true;
    checks.push({
      id: "execution.readOnly",
      status: readOnly ? "passed" : "failed",
      detail: readOnly ? "Execução marcada como somente leitura." : "Resultado não confirmou readOnly=true.",
    });
  } else {
    checks.push({
      id: "execution.result",
      status: "failed",
      detail: "A execução terminou sem resultado estruturado.",
    });