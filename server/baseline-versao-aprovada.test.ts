import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentDecisions, agentProjectStates, projectPlanVersions, projects, scheduleActivities, scheduleBaselines, users, wbsNodes } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { pgliteComSchema } from "./test-helpers/pglite";

/**
 * "EAP APROVADA" É SOBRE A VERSÃO DE TRABALHO.
 *
 * Em 22/10/2026 a AURORA TESTE tinha a v3 aprovada e a v4 (a versão de
 * trabalho, a que a tela edita) em rascunho. `planning.list` dizia
 * `eapApproved: true` porque existia alguma versão aprovada no histórico, a
 * tela de baseline liberava o botão, e `captureBaseline` recusava depois:
 * "A versão de trabalho v4 está em draft".
 *
 * O engenheiro via um botão habilitado e um erro que ele não tinha como
 * prever. Este teste fixa a regra certa: a pergunta é sobre a versão que está
 * sendo editada, não sobre o histórico.
 */

const estado = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./db", async importOriginal => {
  const real = await importOriginal<typeof import("./db")>();
  return { ...real, getDb: async () => estado.db };
});

const { appRouter } = await import("./routers");

let pg: PGlite;

function contexto(user: { id: number; openId: string; name: string }): TrpcContext {
  return {
    user: user as TrpcContext["user"],
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("versão aprovada x versão de trabalho", () => {
  let donoId: number;
  let obraId: number;

  beforeEach(async () => {
    pg = await pgliteComSchema();
    const db = drizzlePglite(pg);
    estado.db = db;

    const [dono] = await db
      .insert(users)
      .values({ openId: "aprov-dono", name: "Engenheiro responsável", email: "eng@exemplo.com" })
      .returning({ id: users.id });
    donoId = dono.id;

    const [obra] = await db
      .insert(projects)
      .values({
        code: "OBRA-APROV-1",
        name: "Obra com versão em rascunho",
        location: "Cidade",
        plannedStart: new Date("2026-02-02T00:00:00Z"),
        plannedFinish: new Date("2026-11-30T00:00:00Z"),
        ownerUserId: donoId,
      })
      .returning({ id: projects.id });
    obraId = obra.id;

    // Histórico: v1 aprovada, v2 a versão de trabalho em rascunho.
    await db.insert(projectPlanVersions).values([
      { projectId: obraId, versionNumber: 1, status: "approved", approvedAt: new Date() },
      { projectId: obraId, versionNumber: 2, status: "draft" },
    ]);
  });

  afterEach(async () => {
    await pg.close();
    estado.db = null;
  });

  it("não deixa aprovar a versão sem o padrão do dicionário aprovado", async () => {
    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "aprov-dono", name: "Engenheiro responsável" }));

    await expect(dono.planning.aprovarVersaoDeTrabalho({ projectId: obraId })).rejects.toThrow(
      /padrão do dicionário de escopo/i
    );
  });

  it("não aprova versão cuja EAP tem bloqueio", async () => {
    const db = drizzlePglite(pg);
    const [versao] = await db
      .select()
      .from(projectPlanVersions)
      .where(eq(projectPlanVersions.versionNumber, 2));

    await db.insert(agentDecisions).values({
      projectId: obraId,
      userId: donoId,
      stage: "EAP_DICIONARIO",
      decision: "approved",
      scopeJson: "{}",
      reason: "Padrão aprovado no teste",
    });
    // Quantidade negativa é bloqueio determinístico da EAP.
    await db.insert(wbsNodes).values({
      projectId: obraId,
      versionId: versao.id,
      code: "1",
      name: "Pacote com quantidade inválida",
      level: 2,
      nodeType: "pacote",
      plannedQuantity: "-5",
    });

    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "aprov-dono", name: "Engenheiro responsável" }));
    await expect(dono.planning.aprovarVersaoDeTrabalho({ projectId: obraId })).rejects.toThrow(
      /bloqueio/i
    );

    // A versão continua em rascunho: recusa não pode deixar efeito colateral.
    const [depois] = await db
      .select()
      .from(projectPlanVersions)
      .where(eq(projectPlanVersions.versionNumber, 2));
    expect(depois.status).toBe("draft");
  });

  it("não aprova EAP com folhas sem os campos obrigatórios do dicionário", async () => {
    const db = drizzlePglite(pg);
    const [versao] = await db
      .select()
      .from(projectPlanVersions)
      .where(eq(projectPlanVersions.versionNumber, 2));
    const [raiz] = await db.insert(wbsNodes).values({
      projectId: obraId,
      versionId: versao.id,
      code: "1",
      name: "Edificação",
      level: 1,
      nodeType: "grupo",
      description: "Edificação da obra.",
      inclusions: "Serviços previstos no escopo.",
      exclusions: "Itens fora do escopo.",
      responsible: "Engenheiro responsável",
      acceptanceCriteria: "Inspeção e aceite registrados.",
      decompositionBasis: "project",
    }).returning({ id: wbsNodes.id });
    await db.insert(wbsNodes).values({
      projectId: obraId,
      versionId: versao.id,
      parentId: raiz.id,
      code: "1.1",
      name: "Fundação",
      level: 2,
      nodeType: "pacote",
      // O plano aprovado exige estes campos para cada folha.
      description: null,
      inclusions: null,
      exclusions: "Superestrutura.",
      responsible: "Engenheiro de estruturas",
      acceptanceCriteria: "Inspeção aprovada.",
      decompositionBasis: "deliverable",
    });
    await db.insert(agentDecisions).values({
      projectId: obraId,
      userId: donoId,
      stage: "EAP_DICIONARIO",
      decision: "approved",
      scopeJson: JSON.stringify({ requiredFields: ["description", "inclusions"] }),
      reason: "Descrição e inclusões são obrigatórias nas folhas.",
    });

    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "aprov-dono", name: "Engenheiro responsável" }));
    await expect(dono.planning.aprovarVersaoDeTrabalho({ projectId: obraId })).rejects.toThrow(
      /1\.1.*descrição\/escopo.*inclusões/i
    );

    const [depois] = await db
      .select()
      .from(projectPlanVersions)
      .where(eq(projectPlanVersions.versionNumber, 2));
    expect(depois.status).toBe("draft");
  });

  it("não deixa a rota do coordenador aprovar uma EAP incompleta", async () => {
    const db = drizzlePglite(pg);
    const [versao] = await db
      .select()
      .from(projectPlanVersions)
      .where(eq(projectPlanVersions.versionNumber, 2));
    const [raiz] = await db.insert(wbsNodes).values({
      projectId: obraId,
      versionId: versao.id,
      code: "1",
      name: "Edificação",
      level: 1,
      nodeType: "grupo",
      description: "Edificação da obra.",
      inclusions: "Serviços previstos no escopo.",
      exclusions: "Itens fora do escopo.",
      responsible: "Engenheiro responsável",
      acceptanceCriteria: "Inspeção e aceite registrados.",
      decompositionBasis: "project",
    }).returning({ id: wbsNodes.id });
    const [folha] = await db.insert(wbsNodes).values({
      projectId: obraId,
      versionId: versao.id,
      parentId: raiz.id,
      code: "1.1",
      name: "Fundação",
      level: 2,
      nodeType: "pacote",
      description: null,
      inclusions: null,
      exclusions: "Superestrutura.",
      responsible: "Engenheiro de estruturas",
      acceptanceCriteria: "Inspeção aprovada.",
      decompositionBasis: "deliverable",
    }).returning({ id: wbsNodes.id });
    await db.insert(agentDecisions).values({
      projectId: obraId,
      userId: donoId,
      stage: "EAP_DICIONARIO",
      decision: "approved",
      scopeJson: JSON.stringify({ requiredFields: ["description", "inclusions"] }),
      reason: "Descrição e inclusões são obrigatórias nas folhas.",
    });
    await db.insert(agentProjectStates).values({ projectId: obraId, stage: "EAP_REVISAO" });

    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "aprov-dono", name: "Engenheiro responsável" }));
    await expect(dono.agent.recordDecision({
      projectId: obraId,
      stage: "EAP_REVISAO",
      decision: "approved",
      nextStage: "ATIVIDADES_PROPOSTA",
      scope: { kind: "eap" },
      summary: "Aprovar EAP de teste.",
    })).rejects.toThrow(/obrigatórios do gate/i);

    const [depois] = await db
      .select()
      .from(projectPlanVersions)
      .where(eq(projectPlanVersions.versionNumber, 2));
    expect(depois.status).toBe("draft");
  });

  it("não anuncia EAP aprovada quando a versão de trabalho é rascunho", async () => {
    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "aprov-dono", name: "Engenheiro responsável" }));
    const planejamento = await dono.planning.list({ projectId: obraId });

    expect(planejamento.eapApproved).toBe(false);
    expect(planejamento.currentVersionNumber).toBe(2);
    expect(planejamento.currentVersionStatus).toBe("draft");
    // O histórico continua visível: existe uma versão aprovada, só não é a atual.
    expect(planejamento.approvedVersionId).not.toBeNull();
  });

  it("passa a anunciar EAP aprovada quando a versão de trabalho é aprovada", async () => {
    const db = drizzlePglite(pg);
    await db
      .update(projectPlanVersions)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(projectPlanVersions.versionNumber, 2));

    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "aprov-dono", name: "Engenheiro responsável" }));
    const planejamento = await dono.planning.list({ projectId: obraId });

    expect(planejamento.eapApproved).toBe(true);
    expect(planejamento.currentVersionStatus).toBe("approved");
  });

  it("o servidor recusa capturar baseline de rascunho (o gate que a tela agora antecipa)", async () => {
    const db = drizzlePglite(pg);
    // Para chegar ao gate da versão o servidor antes exige atividade com CPM
    // fresco — então o cenário tem de ser um plano real, não vazio.
    const [versao] = await db
      .select()
      .from(projectPlanVersions)
      .where(eq(projectPlanVersions.versionNumber, 2));
    const [pacote] = await db
      .insert(wbsNodes)
      .values({
        projectId: obraId,
        code: "1",
        name: "Pacote único",
        level: 2,
        nodeType: "pacote",
        versionId: versao.id,
      })
      .returning({ id: wbsNodes.id });
    await db.insert(scheduleActivities).values({
      projectId: obraId,
      versionId: versao.id,
      wbsNodeId: pacote.id,
      wbsCode: "1.1",
      name: "Serviço único",
      phase: "Teste",
      startOffset: 0,
      durationDays: 5,
      cpmCalculatedAt: new Date(Date.now() + 60_000),
    });

    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "aprov-dono", name: "Engenheiro responsável" }));

    await expect(
      dono.planning.captureBaseline({ projectId: obraId, name: "Baseline indevida" })
    ).rejects.toThrow(/Só uma versão aprovada pode virar baseline/i);

    // E nada foi gravado.
    const baselines = await db.select().from(scheduleBaselines);
    expect(baselines).toHaveLength(0);
  });

  it("recusa captura direta de baseline quando uma folha não cumpre o dicionário aprovado", async () => {
    const db = drizzlePglite(pg);
    const [versao] = await db
      .select()
      .from(projectPlanVersions)
      .where(eq(projectPlanVersions.versionNumber, 2));
    await db.update(projectPlanVersions)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(projectPlanVersions.id, versao.id));
    const [raiz] = await db.insert(wbsNodes).values({
      projectId: obraId,
      versionId: versao.id,
      code: "1",
      name: "Edificação",
      level: 1,
      nodeType: "grupo",
      description: "Edificação da obra.",
      inclusions: "Serviços previstos no escopo.",
      exclusions: "Itens fora do escopo.",
      responsible: "Engenheiro responsável",
      acceptanceCriteria: "Inspeção e aceite registrados.",
      decompositionBasis: "project",
    }).returning({ id: wbsNodes.id });
    const [folha] = await db.insert(wbsNodes).values({
      projectId: obraId,
      versionId: versao.id,
      parentId: raiz.id,
      code: "1.1",
      name: "Fundação",
      level: 2,
      nodeType: "pacote",
      description: null,
      inclusions: null,
      exclusions: "Superestrutura.",
      responsible: "Engenheiro de estruturas",
      acceptanceCriteria: "Inspeção aprovada.",
      decompositionBasis: "deliverable",
    }).returning({ id: wbsNodes.id });
    await db.insert(agentDecisions).values({
      projectId: obraId,
      userId: donoId,
      stage: "EAP_DICIONARIO",
      decision: "approved",
      scopeJson: JSON.stringify({ requiredFields: ["description", "inclusions"] }),
      reason: "Descrição e inclusões são obrigatórias nas folhas.",
    });
    await db.insert(scheduleActivities).values({
      projectId: obraId,
      versionId: versao.id,
      wbsNodeId: folha.id,
      wbsCode: "1.1",
      name: "Fundação",
      phase: "Teste",
      startOffset: 0,
      durationDays: 5,
      cpmCalculatedAt: new Date(Date.now() + 60_000),
    });

    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "aprov-dono", name: "Engenheiro responsável" }));
    await expect(
      dono.planning.captureBaseline({ projectId: obraId, name: "Baseline indevida" })
    ).rejects.toThrow(/dicionário da EAP|Folha 1\.1/i);
    expect(await db.select().from(scheduleBaselines)).toHaveLength(0);
  });
});
