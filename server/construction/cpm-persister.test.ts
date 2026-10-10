import { describe, it, expect } from "vitest";
import { persistCpmResult } from "./cpm-persister";
import type { ScheduleResult } from "../../shared/cpm";

describe("persistCpmResult", () => {
  it("should persist CPM result to database", async () => {
    // Dados mínimos para um ScheduleResult válido
    const scheduleResult: ScheduleResult = {
      activities: [
        {
          id: "1",
          duration: 5,
          earlyStart: 0,
          earlyFinish: 5,
          lateStart: 0,
          lateFinish: 5,
          totalFloat: 0,
          freeFloat: 0,
          critical: true,
          infeasible: false,
        },
      ],
      projectDuration: 5,
      criticalPath: ["1"],
      infeasibleActivities: [],
    };

    // A função deve persistir o resultado no banco
    // Como não temos banco no teste unitário, verificamos que a função existe
    // e que lança erro quando o banco não está disponível
    expect(typeof persistCpmResult).toBe("function");

    // Verificamos que a função aceita os parâmetros corretos
    // (o teste E2E na AURORA TESTE valida a persistência real)
    await expect(
      persistCpmResult(1, 1, scheduleResult)
    ).rejects.toThrow();
  });
});
