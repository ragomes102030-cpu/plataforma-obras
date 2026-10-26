import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Regressão: a Curva S não deve inventar calendário 5x2 quando a obra
 * declarou dias de trabalho e exceções próprios.
 */
const front = readFileSync("client/src/components/AbaCurvaS.tsx", "utf8");
const router = readFileSync("server/routers.ts", "utf8");
const start = router.indexOf("    getCalendarForCurve: protectedProcedure");
const end = router.indexOf("    getCalendar: protectedProcedure", start);
const procedure = router.slice(start, end);
describe("Curva S usa o calendário da obra", () => {
  it("não cria calendário padrão independente do CPM no navegador", () => {
    expect(front).not.toContain("defaultCalendar(");
    expect(front).not.toContain("brazilianHolidays(");
    expect(front).toContain("trpc.planning.getCalendarForCurve.useQuery");
    expect(front).toContain("consultaCalendario.data.weekPattern");
    expect(front).toContain("consultaCalendario.data.exceptions");
  });
  it("carrega feriados e exceções de vários anos pelo mesmo leitor do EVM", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(procedure).toContain("carregarCalendarioDoPeriodo(");
    expect(procedure).toContain("assertAccessibleProject(");
    expect(procedure).toContain("input.startYear + 2");
  });
  it("não exibe datas calculadas com calendário presumido se a consulta falhar", () => {
    expect(front).toContain("consultaCalendario.isError");
    expect(front).toContain("não pode usar dias úteis presumidos");
  });
});
