// Testes do módulo work-calendar.
//
// Regra de ouro: o calendário é puro, sem banco, sem rede, sem relógio.
// Todo teste aqui é reprodutível e roda em qualquer máquina, em qualquer
// fuso horário. As datas são construídas com new Date(ano, mês, dia)
// (fuso local, mês em base 0), NÃO com new Date("YYYY-MM-DD") que
// o JavaScript interpreta como UTC — o que inverte o dia da semana
// quando o fuso não é UTC.
import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  brazilianHolidays,
  dateAt,
  elapsedWorkingDays,
  easterSunday,
  formatDate,
  indexOf,
  isWorkingDay,
  nextWorkingDay,
  defaultCalendar,
  type WorkCalendar,
} from "./work-calendar";

// --------------------------------------------------------- easter
describe("easterSunday", () => {
  // datas confirmadas pelo NIST/Wikipédia.
  it.each([
    [2023, "2023-04-09"],
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
  ] as const)("ano %d → %s", (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });
});

// ------------------------------------------------------ feriados brasileiros
describe("brazilianHolidays", () => {
  const h = brazilianHolidays(2026);
  const byDate = new Map(h.map((x) => [x.date, x]));

  it("gera 16 candidatos para 2026", () => {
    // 9 nacional + 4 facultativo + 3 observance
    expect(h.length).toBe(16);
  });

  it("classifica corretamente por tipo", () => {
    const nacionais = h.filter((x) => x.type === "national_holiday");
    const facultativo = h.filter((x) => x.type === "facultative");
    const observance = h.filter((x) => x.type === "observance");
    expect(nacionais).toHaveLength(9);
    expect(facultativo).toHaveLength(4);
    expect(observance).toHaveLength(3);
  });

  it("Corpus Christi é Easter + 60 dias", () => {
    // easterSunday(2026)=2026-04-05 → 2026-06-04
    expect(byDate.get("2026-06-04")?.type).toBe("national_holiday");
    expect(byDate.get("2026-06-04")?.name).toContain("Corpus Christi");
  });

  it("Carnaval segunda é Easter − 48 dias", () => {
    // easterSunday(2026)=2026-04-05 → 2026-02-16
    const c = byDate.get("2026-02-16");
    expect(c?.name).toContain("Carnaval");
    expect(c?.type).toBe("facultative");
  });

  it("20 de novembro é feriado nacional", () => {
    expect(byDate.get("2026-11-20")?.type).toBe("national_holiday");
  });

  it("21 de abril e 15 de novembro são feriados nacionais", () => {
    expect(byDate.get("2026-04-21")?.type).toBe("national_holiday");
    expect(byDate.get("2026-11-15")?.type).toBe("national_holiday");
  });

  it("12 de outubro é observância, não feriado nacional", () => {
    expect(byDate.get("2026-10-12")?.type).toBe("observance");
  });
});

// ----------------------------------------------------- comportamento do dia
describe("isWorkingDay", () => {
  const cal = defaultCalendar(2026);

  it("segunda a sexta são úteis quando não há exceção", () => {
    expect(isWorkingDay(cal, new Date(2026, 1, 2))).toBe(true);  // seg
    expect(isWorkingDay(cal, new Date(2026, 1, 3))).toBe(true);  // ter
    expect(isWorkingDay(cal, new Date(2026, 1, 6))).toBe(true);  // sex
  });

  it("sábado e domingo não são úteis", () => {
    expect(isWorkingDay(cal, new Date(2026, 1, 7))).toBe(false); // sáb
    expect(isWorkingDay(cal, new Date(2026, 1, 8))).toBe(false); // dom
  });

  it("feriado nacional não é útil", () => {
    // 2026-04-21 = terça, Tiradentes (mês 3, dia 21)
    expect(isWorkingDay(cal, new Date(2026, 3, 21))).toBe(false);
    // 2026-04-20 = segunda, dia da Páscoa — não é feriado, é útil
    expect(isWorkingDay(cal, new Date(2026, 3, 20))).toBe(true);
  });

  it("Sexta-feira Santa (ponto facultativo) não é útil", () => {
    // 2026-04-03 = sexta, Sexta-feira Santa (easter 04-05 − 2)
    expect(isWorkingDay(cal, new Date(2026, 3, 3))).toBe(false);
  });

  it("um calendar customizado pode marcar feriado como dia útil", () => {
    // obra que opera em feriados nacionais (art. 2º Lei 662)
    const sevenDays: WorkCalendar = {
      weekPattern: { workingWeekdays: [0, 1, 2, 3, 4, 5, 6] },
      exceptions: [],
    };
    expect(isWorkingDay(sevenDays, new Date(2026, 11, 25))).toBe(true);
  });
});

// ------------------------------------------------------- index ↔ data
describe("dateAt", () => {
  // 2026-01-01 é quinta-feira, mas é feriado nacional.
  // Primeiro dia útil do ano = 2026-01-02 (sexta).
  const start = "2026-01-01";
  const cal = defaultCalendar(2026);

  it("dateAt(start, 0) = primeiro dia útil >= start", () => {
    expect(dateAt(cal, start, 0)).toBe("2026-01-02");
  });

  it("dateAt pula fim de semana", () => {
    // 01-02(fri) → 01-03,01-04(fim-de-semana) → 01-05(seg)
    expect(dateAt(cal, start, 1)).toBe("2026-01-05");
    expect(dateAt(cal, start, 2)).toBe("2026-01-06");
  });

  it("dateAt pula feriados", () => {
    // Tiradentes 2026-04-21 é terça, feriado.
    const aprilStart = "2026-04-20"; // segunda, útil
    expect(dateAt(cal, aprilStart, 0)).toBe("2026-04-20");
    expect(dateAt(cal, aprilStart, 1)).toBe("2026-04-22");
  });

  it("funciona quando o início já é dia útil", () => {
    // 2026-01-02 é sexta, útil
    expect(dateAt(cal, "2026-01-02", 0)).toBe("2026-01-02");
    expect(dateAt(cal, "2026-01-02", 1)).toBe("2026-01-05");
  });
});

describe("indexOf e elapsedWorkingDays", () => {
  const cal = defaultCalendar(2026);
  const start = "2026-01-01"; // feriado

  it("indexOf é o inverso de dateAt", () => {
    for (let i = 0; i <= 20; i++) {
      const d = dateAt(cal, start, i);
      expect(indexOf(cal, start, d)).toBe(i);
    }
  });

  it("elapsedWorkingDays conta 0 no dia do início", () => {
    expect(elapsedWorkingDays(cal, start, start)).toBe(0);
  });

  it("elapsedWorkingDays ignora feriado no início", () => {
    // [01-01, 01-02): só 01-01 existe, e é feriado → 0
    expect(elapsedWorkingDays(cal, start, "2026-01-02")).toBe(0);
  });

  it("elapsedWorkingDays conta o primeiro dia útil", () => {
    // [01-01, 01-05): {01-02} → 1
    expect(elapsedWorkingDays(cal, start, "2026-01-05")).toBe(1);
  });

  it("elapsedWorkingDays ignora fim de semana (e conta o dia útil extra)", () => {
    // [01-01, 01-07): {01-02(sex), 01-05(seg), 01-06(ter)} → 3
    expect(elapsedWorkingDays(cal, start, "2026-01-07")).toBe(3);
  });
});

describe("addWorkingDays", () => {
  // Semântica aditiva: n=0 devolve o próprio start; n=1 o próximo útil.
  const cal = defaultCalendar(2026);

  it("n=0 devolve o próprio start", () => {
    expect(addWorkingDays(cal, "2026-01-01", 0)).toBe("2026-01-01");
  });

  it("n=1 avança para o próximo dia útil", () => {
    // 2026-01-01(feriado) → próximo útil = 2026-01-02
    expect(addWorkingDays(cal, "2026-01-01", 1)).toBe("2026-01-02");
  });

  it("n negativo recua", () => {
    expect(addWorkingDays(cal, "2026-01-01", -1)).toBe("2025-12-31");
  });

  it("pula fim de semana", () => {
    // 2026-01-02(sex) +1 útil = 2026-01-05(seg)
    expect(addWorkingDays(cal, "2026-01-02", 1)).toBe("2026-01-05");
  });

  it("é equivalente a dateAt quando start é útil e n>0", () => {
    const s = "2026-01-02"; // útil
    for (let n = 1; n <= 5; n++) {
      expect(addWorkingDays(cal, s, n)).toBe(dateAt(cal, s, n));
    }
  });
});

describe("nextWorkingDay", () => {
  const cal = defaultCalendar(2026);

  it("avança para o próximo dia útil estrito", () => {
    // 2026-01-02(sex) → 01-03(sáb) → 01-04(dom) → 01-05(seg)
    expect(nextWorkingDay(cal, "2026-01-02")).toBe("2026-01-05");
  });
});

// ------------------------------------------------------- formatação
describe("formatDate", () => {
  it("formato brasileiro", () => {
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });
});
