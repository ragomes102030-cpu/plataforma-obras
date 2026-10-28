import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projects, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { pgliteComSchema } from "./test-helpers/pglite";

/**
 * ISOLAMENTO ENTRE OBRAS — o teste que tenta invadir.
 *
 * O guarda estatico (`access-guard.test.ts`) le o codigo e exige que toda
 * procedure com `projectId` chame o guard. Isso prova que a chamada existe, nao
 * que ela barra: um `assertAccessibleProject` com o `userId` trocado, ou um
 * `WHERE` faltando, passa no teste estatico e entrega a obra do vizinho.
 *
 * Aqui o ataque e de verdade, com dois usuarios e um PostgreSQL real (PGlite):
 * o usuario B recebe o id da obra do usuario A — exatamente o que acontece
 * quando alguem troca o numero na URL — e chama as procedures pela camada tRPC,
 * com o `ctx.user` de B. O esperado e FORBIDDEN, nao "quase".
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

describe("isolamento entre obras", () => {
  let donoId: number;
  let intrusoId: number;
  let obraDoDono: number;

  beforeEach(async () => {
    pg = await pgliteComSchema();
    const db = drizzlePglite(pg);
    estado.db = db;

    const [dono] = await db
      .insert(users)
      .values({ openId: "iso-dono", name: "Dono da obra", email: "dono@exemplo.com" })
      .returning({ id: users.id });
    const [intruso] = await db
      .insert(users)
      .values({ openId: "iso-intruso", name: "Outra pessoa", email: "intruso@exemplo.com" })
      .returning({ id: users.id });

    donoId = dono.id;
    intrusoId = intruso.id;

    const [obra] = await db
      .insert(projects)
      .values({
        code: "OBRA-ISO-1",
        name: "Obra do dono",
        location: "Cidade do dono",
        plannedStart: new Date("2026-01-05T00:00:00Z"),
        plannedFinish: new Date("2026-12-20T00:00:00Z"),
        ownerUserId: donoId,
      })
      .returning({ id: projects.id });
    obraDoDono = obra.id;
  });

  afterEach(async () => {
    await pg.close();
    estado.db = null;
  });

  it("quem nao e dono nao le as medicoes da obra alheia", async () => {
    const intruso = appRouter.createCaller(contexto({ id: intrusoId, openId: "iso-intruso", name: "Outra pessoa" }));

    await expect(intruso.financeiro.medicoes({ projectId: obraDoDono })).rejects.toThrow(
      /sem permiss/i
    );
  });

  it("quem nao e dono nao altera o escopo da obra alheia", async () => {
    const intruso = appRouter.createCaller(contexto({ id: intrusoId, openId: "iso-intruso", name: "Outra pessoa" }));

    await expect(
      intruso.projects.updateScope({
        projectId: obraDoDono,
        location: "Cidade do intruso",
        tipoDeObra: "edificio",
        descricao: "alteracao indevida",
        plannedStart: new Date("2026-02-01T00:00:00Z"),
        plannedFinish: new Date("2027-12-31T00:00:00Z"),
      })
    ).rejects.toThrow(/sem permiss/i);

    // E o dado continua intacto no banco — nao basta a chamada falhar depois de escrever.
    const db = drizzlePglite(pg);
    const [obra] = await db.select({ location: projects.location, plannedStart: projects.plannedStart, plannedFinish: projects.plannedFinish }).from(projects);
    expect(obra.location).not.toBe("Cidade do intruso");
    expect(obra.plannedStart.toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect(obra.plannedFinish.toISOString()).toBe("2026-12-20T00:00:00.000Z");
  });

  it("o dono atualiza o periodo cadastrado da propria obra", async () => {
    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "iso-dono", name: "Dono da obra" }));
    const plannedStart = new Date("2026-01-05T00:00:00Z");
    const plannedFinish = new Date("2028-12-28T00:00:00Z");

    await dono.projects.updateScope({
      projectId: obraDoDono,
      location: "Cidade do dono",
      tipoDeObra: "edificio",
      descricao: "Escopo original confirmado para a obra de teste.",
      plannedFinish,
    });

    const db = drizzlePglite(pg);
    const [obra] = await db
      .select({ plannedStart: projects.plannedStart, plannedFinish: projects.plannedFinish })
      .from(projects)
      .where(eq(projects.id, obraDoDono));
    expect(obra.plannedStart.toISOString()).toBe(plannedStart.toISOString());
    expect(obra.plannedFinish.toISOString()).toBe(plannedFinish.toISOString());
  });

  it("o periodo cadastrado exige termino posterior ao inicio", async () => {
    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "iso-dono", name: "Dono da obra" }));

    await expect(dono.projects.updateScope({
      projectId: obraDoDono,
      location: "Cidade do dono",
      tipoDeObra: "edificio",
      descricao: "Escopo original confirmado para a obra de teste.",
      plannedStart: new Date("2028-12-29T00:00:00Z"),
      plannedFinish: new Date("2028-12-28T00:00:00Z"),
    })).rejects.toThrow(/término da obra deve ser posterior ao início/i);
  });

  it("obra inexistente responde igual a obra alheia (nao vaza existencia)", async () => {
    const intruso = appRouter.createCaller(contexto({ id: intrusoId, openId: "iso-intruso", name: "Outra pessoa" }));

    const deOutro = await intruso.financeiro.medicoes({ projectId: obraDoDono }).catch(e => e.message);
    const inexistente = await intruso.financeiro.medicoes({ projectId: 999_999 }).catch(e => e.message);

    // Mensagens identicas: descobrir "essa obra existe" ja e informacao.
    expect(inexistente).toBe(deOutro);
  });

  it("o dono continua lendo a propria obra", async () => {
    const dono = appRouter.createCaller(contexto({ id: donoId, openId: "iso-dono", name: "Dono da obra" }));

    await expect(dono.financeiro.medicoes({ projectId: obraDoDono })).resolves.toBeTruthy();
  });
});
