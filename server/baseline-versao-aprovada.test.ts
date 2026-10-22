import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectPlanVersions, projects, scheduleActivities, scheduleBaselines, users, wbsNodes } from "../drizzle/schema";
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
});
