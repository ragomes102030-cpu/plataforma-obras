import { describe, expect, it } from "vitest";
import type { LinhaDesvio } from "./desvios-baseline";
import { prepararBarrasBaselineGantt } from "./gantt-baseline-visual";
import { congelarDatasBaseline, lerDatasCapturadasBaseline, type BaselineActivityDate } from "./baseline-dates";
import type { WorkCalendar } from "./work-calendar";

const calendario: WorkCalendar = { weekPattern: { workingWeekdays: [1, 2, 3, 4, 5] }, exceptions: [] };
const linha = (id: number, codigo: string, delta = 0): LinhaDesvio => ({
  chave: codigo, atividadeId: id + 100, baselineAtividadeId: id, wbsCode: codigo, nome: `Serviço ${id}`,
  situacao: delta > 0 ? "atrasada" : "igual", baselineInicio: 0, baselineFim: 2,
  atualInicio: 0, atualFim: 2 + delta, deltaInicio: 0, deltaFim: delta,
});
const data = (id: number, codigo: string | null, inicio: string, fim: string): BaselineActivityDate => ({
  activityId: id, wbsCode: codigo, name: `Serviço ${id}`, inicio, fim,
});

describe("baseline civil congelada", () => {
  it("converte índices CPM apenas na captura, respeitando término exclusivo e feriados", () => {
    const personalizado = { ...calendario, exceptions: [{ date: "2026-10-26", type: "national_holiday" as const }] };
    const datas = congelarDatasBaseline([
      { id: 1, wbsCode: "1.1", name: "Serviço", earlyStart: 0, earlyFinish: 2 },
      { id: 2, wbsCode: "1.2", name: "Marco", earlyStart: 0, earlyFinish: 0 },
    ], "2026-10-23", personalizado);
    expect(datas[0]).toMatchObject({ inicio: "2026-10-23", fim: "2026-10-27" });
    expect(datas[1]).toMatchObject({ inicio: "2026-10-23", fim: "2026-10-23" });
    const barras = prepararBarrasBaselineGantt([linha(1, "1.1", 2)], datas);
    expect(barras.get("1.1")).toMatchObject({ inicio: "2026-10-23", fim: "2026-10-27", deltaFim: 2 });
  });

  it("agrega todas as atividades do mesmo pacote sem escolher o desvio de uma delas", () => {
    const datas = [data(2, "1.8.1", "2026-10-26", "2026-11-20"), data(1, "1.8.1", "2026-10-01", "2026-10-23")];
    const barras = prepararBarrasBaselineGantt([linha(1, "1.8.1", 2), linha(2, "1.8.1", 5)], datas);
    expect(barras.size).toBe(1);
    expect(barras.get("1.8.1")).toMatchObject({
      inicio: "2026-10-01", fim: "2026-11-20", atividades: 2,
      situacao: "indefinida", deltaInicio: null, deltaFim: null,
    });
  });

  it("usa o id da fotografia depois de abrir nova versão e preserva pacote removido", () => {
    const barras = prepararBarrasBaselineGantt([
      linha(1, "1.1", 3), { ...linha(2, "1.2"), atividadeId: null, situacao: "removida" },
    ], [data(1, "1.1", "2026-10-01", "2026-10-02"), data(2, "1.2", "2026-10-03", "2026-10-04")]);
    expect(barras.get("1.1")?.deltaFim).toBe(3);
    expect(barras.get("1.2")?.situacao).toBe("removida");
  });

  it("não reconstrói datas para baseline legada nem aceita fotografia de outra baseline", () => {
    expect(prepararBarrasBaselineGantt([linha(1, "1.1")], null).size).toBe(0);
    const payload = { baselineId: 7, snapshotVersion: 1, activityDates: [data(1, "1.1", "2026-10-01", "2026-10-02")] };
    expect(lerDatasCapturadasBaseline(payload, 7)).toEqual(payload.activityDates);
    expect(lerDatasCapturadasBaseline(payload, 8)).toBeNull();
    expect(lerDatasCapturadasBaseline({ ...payload, activityDates: [data(1, "1.1", "2026-02-30", "2026-03-01")] }, 7)).toBeNull();
    expect(lerDatasCapturadasBaseline({ ...payload, activityDates: [...payload.activityDates, ...payload.activityDates] }, 7)).toBeNull();
  });
});
