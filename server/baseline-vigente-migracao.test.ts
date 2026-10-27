import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/0020_baseline_vigente_unica.sql", "utf8");
const router = readFileSync("server/routers.ts", "utf8");
const schema = readFileSync("drizzle/schema.ts", "utf8");
const ui = readFileSync("client/src/components/PainelDesviosBaseline.tsx", "utf8");

describe("Baseline vigente — integridade e histórico", () => {
  it("normaliza duplicatas no banco sem excluir fotografias e bloqueia futuras duplicações", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TYPE schedule_baselines_status AS ENUM ('rascunho','ativa','arquivada');
        CREATE TABLE schedule_baselines (
          id integer PRIMARY KEY,
          "projectId" integer NOT NULL,
          status schedule_baselines_status DEFAULT 'ativa' NOT NULL,
          "createdAt" timestamptz NOT NULL
        );
        INSERT INTO schedule_baselines VALUES
          (4,7,'ativa','2026-10-10T14:29:46Z'),
          (6,7,'ativa','2026-10-22T15:43:09Z'),
          (10,8,'ativa','2026-09-01T00:00:00Z');
      `);
      await db.exec(sql);
      const result = await db.query<{ id: number; status: string }>(
        'SELECT id, status FROM schedule_baselines WHERE "projectId"=7 ORDER BY id'
      );
      expect(result.rows).toEqual([{ id: 4, status: "arquivada" }, { id: 6, status: "ativa" }]);
      await expect(db.exec(`INSERT INTO schedule_baselines VALUES
        (7,7,'ativa','2026-10-23T00:00:00Z');`)).rejects.toThrow();
      await db.exec(`UPDATE schedule_baselines SET status='arquivada'
        WHERE "projectId"=7 AND status='ativa';
        INSERT INTO schedule_baselines VALUES (7,7,'ativa','2026-10-23T00:00:00Z');`);
      const historic = await db.query<{ id:number; status:string }>(
        'SELECT id,status FROM schedule_baselines WHERE "projectId"=7 ORDER BY id'
      );
      expect(historic.rows).toEqual([
        {id:4,status:"arquivada"},{id:6,status:"arquivada"},{id:7,status:"ativa"}
      ]);
      await db.exec(sql); // idempotência
    } finally {
      await db.close();
    }
  });
  it("servidor só usa baseline ativa automaticamente; histórica continua consultável por id", () => {
    expect(router).toContain('eq(scheduleBaselines.status, "ativa")');
    expect(router).toContain('status: "arquivada"');
    expect(router).toContain("input.baselineId");
    expect(ui).toContain("Baseline histórica");
    expect(ui).toContain("VIGENTE");
    expect(schema).toContain("schedule_baselines_uma_ativa_por_obra_idx");
  });
});
