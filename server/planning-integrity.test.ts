import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetItems, budgetVersions, projectPlanVersions, projects, scheduleActivities, users, wbsNodes } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { pgliteComSchema } from "./test-helpers/pglite";

const estado = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", async importOriginal => {
  const real = await importOriginal<typeof import("./db")>();
  return { ...real, getDb: async () => estado.db };
});

const { appRouter } = await import("./routers");

let pg: PGlite;
let db: ReturnType<typeof drizzlePglite>;
let ownerId: number;
let projectId: number;
let caller: ReturnType<typeof appRouter.createCaller>;

function context(user: { id: number; openId: string; name: string }): TrpcContext {
  return {
    user: user as TrpcContext["user"],
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(async () => {
  pg = await pgliteComSchema();
  db = drizzlePglite(pg);
  estado.db = db;
  const [owner] = await db.insert(users)
    .values({ openId: "eap-proposal-owner", name: "Engenheira" })
    .returning({ id: users.id });
  ownerId = owner.id;
  const [project] = await db.insert(projects)
    .values({
      ownerUserId: ownerId,
      code: "OBRA-EAP-PROPOSTA",
      name: "Obra de teste de proposta",
      location: "Local",
      plannedStart: new Date("2026-01-01T00:00:00Z"),
      plannedFinish: new Date("2026-12-31T00:00:00Z"),
    })
    .returning({ id: projects.id });
  projectId = project.id;
  const [version] = await db.insert(projectPlanVersions)
    .values({ projectId, versionNumber: 1, status: "draft" })
    .returning({ id: projectPlanVersions.id });
  await db.insert(wbsNodes).values({
    projectId,
    versionId: version.id,
    code: "1",
    name: "Obra",
    level: 1,
    nodeType: "grupo",
    sortOrder: 0,
  });
  caller = appRouter.createCaller(context({ id: ownerId, openId: "eap-proposal-owner", name: "Engenheira" }));
});

afterEach(async () => {
  await pg.close();
  estado.db = null;
});

const itemCriado = (overrides: Record<string, unknown> = {}) => ({
  operation: "create",
  parentCode: "1",
  name: "Estrutura",
  nodeType: "grupo",
  rationale: "Frente de controle independente.",
  ...overrides,
});

function proposal(nodes: unknown[]) {
  return { action: "propose_eap", basis: ["escopo da obra"], assumptions: [], missingInformation: [], nodes };
}

describe("aplicarPropostaEap", () => {
  it("valida todos os vínculos de conciliação antes de gravar e exclui atividades históricas", async () => {
    const oldRoot = (await db.select().from(wbsNodes)).find(node => node.projectId === projectId)!;
    const [currentPlan] = await db.insert(projectPlanVersions)
      .values({ projectId, versionNumber: 2, status: "draft" })
      .returning({ id: projectPlanVersions.id });
    const [currentRoot] = await db.insert(wbsNodes).values({
      projectId,
      versionId: currentPlan!.id,
      code: "1",
      name: "Raiz atual",
      level: 1,
      nodeType: "grupo",
      sortOrder: 0,
    }).returning({ id: wbsNodes.id });
    const [currentActivity] = await db.insert(scheduleActivities).values({
      projectId,
      versionId: currentPlan!.id,
      wbsNodeId: currentRoot!.id,
      wbsCode: "1",
      name: "Atividade atual",
      phase: "Execução",
      startOffset: 0,
      durationDays: 1,
    }).returning({ id: scheduleActivities.id });
    const [historicalActivity] = await db.insert(scheduleActivities).values({
      projectId,
      versionId: oldRoot.versionId,
      wbsNodeId: oldRoot.id,
      wbsCode: "1",
      name: "Atividade histórica",
      phase: "Execução",
      startOffset: 0,
      durationDays: 1,
    }).returning({ id: scheduleActivities.id });
    const [budget] = await db.insert(budgetVersions).values({
      projectId,
      name: "Orçamento de teste",
      versionNumber: 1,
      status: "rascunho",
    }).returning({ id: budgetVersions.id });
    const [budgetItem] = await db.insert(budgetItems).values({
      budgetVersionId: budget!.id,
      wbsNodeId: currentRoot!.id,
      code: "ITEM-1",
      description: "Item de teste",
      unit: "un",
      quantity: "10.000",
      unitPrice: "20.00",
    }).returning({ id: budgetItems.id });

    await expect(caller.planning.aplicarConciliacao({
      projectId,
      vinculos: [
        { activityId: currentActivity!.id, budgetItemId: budgetItem!.id },
        { activityId: historicalActivity!.id, budgetItemId: budgetItem!.id },
      ],
    })).rejects.toThrow(/versão de trabalho atual/i);

    const activities = await db.select().from(scheduleActivities);
    expect(activities.find(activity => activity.id === currentActivity!.id)?.budgetItemId).toBeNull();
  });

  it("não vincula itens de orçamento a uma EAP de outra obra", async () => {
    const [budget] = await db.insert(budgetVersions)
      .values({ projectId, name: "Orçamento de teste", versionNumber: 1, status: "rascunho" })
      .returning({ id: budgetVersions.id });
    const [otherProject] = await db.insert(projects)
      .values({
        ownerUserId: ownerId,
        code: "OBRA-EAP-OUTRA",
        name: "Outra obra",
        location: "Outro local",
        plannedStart: new Date("2026-01-01T00:00:00Z"),
        plannedFinish: new Date("2026-12-31T00:00:00Z"),
      })
      .returning({ id: projects.id });
    const [nextPlanVersion] = await db.insert(projectPlanVersions)
      .values({ projectId, versionNumber: 2, status: "draft" })
      .returning({ id: projectPlanVersions.id });
    await db.insert(wbsNodes).values({
      projectId,
      versionId: nextPlanVersion!.id,
      code: "1",
      name: "EAP de trabalho atual",
      level: 1,
      nodeType: "grupo",
      sortOrder: 0,
    });
    const oldNode = (await db.select().from(wbsNodes)).find(node => node.projectId === projectId)!;
    const [foreignNode] = await db.insert(wbsNodes).values({
      projectId: otherProject.id,
      code: "1",
      name: "EAP de outra obra",
      level: 1,
      nodeType: "grupo",
      sortOrder: 0,
    }).returning({ id: wbsNodes.id });

    await expect(caller.budgets.createItem({
      projectId,
      budgetVersionId: budget!.id,
      code: "ITEM-1",
      description: "Item de orçamento",
      unit: "un",
      quantity: 1,
      unitPrice: 0,
      wbsNodeId: foreignNode!.id,
    })).rejects.toThrow(/versão de trabalho atual/i);
    await expect(caller.budgets.createItem({
      projectId,
      budgetVersionId: budget!.id,
      code: "ITEM-HISTORICO",
      description: "Item ligado à EAP anterior",
      unit: "un",
      quantity: 1,
      unitPrice: 0,
      wbsNodeId: oldNode.id,
    })).rejects.toThrow(/versão de trabalho atual/i);
    await expect(caller.budgets.createItems({
      projectId,
      budgetVersionId: budget!.id,
      items: [{
        code: "ITEM-2",
        description: "Item em lote",
        unit: "un",
        quantity: 1,
        unitPrice: 0,
        wbsNodeId: foreignNode!.id,
      }],
    })).rejects.toThrow(/versão de trabalho atual/i);

    expect(await db.select().from(budgetItems)).toHaveLength(0);
  });

  it("recusa bases de decomposição fora do vocabulário da EAP", async () => {
    const [root] = await db.select().from(wbsNodes);
    await expect(caller.projects.createWbsNode({
      projectId,
      parentId: root!.id,
      name: "Disciplina inválida",
      nodeType: "grupo",
      decompositionBasis: "fase-nao-oficial" as never,
    })).rejects.toThrow();
    expect(await db.select().from(wbsNodes)).toHaveLength(1);
  });

  it("recusa unidade fora do vocabulário de medição mesmo em proposta da IA", async () => {
    await expect(caller.eap.aplicarPropostaEap({
      projectId,
      confirm: true,
      proposal: proposal([itemCriado({ unit: "kgf" })]),
    })).rejects.toThrow();
    expect(await db.select().from(wbsNodes)).toHaveLength(1);
  });

  it("revalida no servidor e não aplica uma proposta estruturalmente inválida", async () => {
    await expect(caller.eap.aplicarPropostaEap({
      projectId,
      confirm: true,
      proposal: proposal([
        itemCriado({ nodeType: "pacote" }),
        itemCriado({ parentCode: "1.1", name: "Execução", nodeType: "entrega" }),
      ]),
    })).rejects.toThrow(/inconsistências/i);

    const nodes = await db.select().from(wbsNodes);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.name).toBe("Obra");
  });

  it("aplica os campos aprovados em transação e aloca o código no servidor", async () => {
    const result = await caller.eap.aplicarPropostaEap({
      projectId,
      confirm: true,
      proposal: proposal([itemCriado({
        code: "99",
        name: "Estrutura",
        nodeType: "pacote",
        unit: "m²",
        plannedQuantity: 12.345,
        description: "Elementos estruturais da edificação.",
        decompositionBasis: "system",
      })]),
    });

    expect(result).toMatchObject({
      applied: true,
      created: 1,
      baselineCreated: false,
      approved: false,
      verification: { persistenceVerified: true, nodeCount: 2, leafCount: 1, structuralErrors: 0 },
    });
    const nodes = await db.select().from(wbsNodes);
    expect(nodes.find(node => node.name === "Estrutura")).toMatchObject({
      code: "1.1",
      unit: "m²",
      plannedQuantity: "12.345",
      description: "Elementos estruturais da edificação.",
      decompositionBasis: "system",
      scopeStatus: "rascunho",
    });
  });

  it("confere no banco os campos de uma atualização antes de reportar sucesso", async () => {
    const [root] = await db.select().from(wbsNodes);
    const [leaf] = await db.insert(wbsNodes).values({
      projectId,
      versionId: root!.versionId,
      parentId: root!.id,
      code: "1.1",
      name: "Escopo pendente",
      level: 2,
      nodeType: "pacote",
      sortOrder: 1,
    }).returning({ id: wbsNodes.id });

    const result = await caller.eap.aplicarPropostaEap({
      projectId,
      confirm: true,
      proposal: proposal([{
        operation: "update",
        nodeId: leaf!.id,
        parentCode: "1",
        code: "1.1",
        name: "Estrutura",
        nodeType: "pacote",
        description: "Elementos estruturais previstos no escopo registrado.",
        rationale: "Completa a descrição do pacote sem criar quantidade.",
      }]),
    });

    expect(result).toMatchObject({
      applied: true,
      created: 0,
      updated: 1,
      verification: { persistenceVerified: true, expectedChangesVerified: true, nodeCount: 2 },
    });
    const persisted = (await db.select().from(wbsNodes)).find(node => node.id === leaf!.id);
    expect(persisted).toMatchObject({ name: "Estrutura", description: "Elementos estruturais previstos no escopo registrado." });
  });
});
