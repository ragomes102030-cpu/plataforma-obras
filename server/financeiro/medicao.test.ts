import { describe, expect, it } from "vitest";
import {
  podeTransicionar,
  periodosSobrepostos,
  transicoesPermitidas,
  validarPeriodo,
  calcularMedicao,
  type ItemDeOrcamento,
  type MedicaoEntrada,
} from "./medicao";

const escavacao: ItemDeOrcamento = {
  budgetItemId: 1,
  code: "01.01",
  description: "Escavação mecanizada",
  unit: "m3",
  quantity: 100,
  unitPrice: 10,
};

function entrada(over: Partial<MedicaoEntrada> = {}): MedicaoEntrada {
  return {
    itens: [escavacao],
    produzidoAcumulado: [{ budgetItemId: 1, quantity: 60 }],
    medidoAcumuladoAnterior: [{ budgetItemId: 1, quantity: 25 }],
    retentionPercent: 0,
    ...over,
  };
}

describe("calcularMedicao", () => {
  it("cobra a diferença entre o acumulado produzido e o já medido", () => {
    const r = calcularMedicao(entrada());

    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].quantidadeAcumulada).toBe(60);
    expect(r.itens[0].quantidadeAnterior).toBe(25);
    expect(r.itens[0].quantidadeNoPeriodo).toBe(35);
    expect(r.itens[0].valorNoPeriodo).toBe(350);
    expect(r.bruto).toBe(350);
    expect(r.liquido).toBe(350);
  });

  it("fecha o saldo contratado com o acumulado, sem dupla contagem", () => {
    const r = calcularMedicao(entrada());

    expect(r.totalContratado).toBe(1000);
    expect(r.totalAcumulado).toBe(600);
    // 1000 contratado − 250 já medido − 350 desta medição = 400
    expect(r.saldoTotal).toBe(400);
    expect(r.saldoTotal).toBe(r.totalContratado - r.totalAcumulado);
  });

  it("aplica retenção técnica sobre o bruto, sem tocar no acumulado", () => {
    const r = calcularMedicao(entrada({ retentionPercent: 10 }));

    expect(r.bruto).toBe(350);
    expect(r.retencao).toBe(35);
    expect(r.liquido).toBe(315);
    // Retenção é dinheiro retido, não serviço não executado.
    expect(r.totalAcumulado).toBe(600);
    expect(r.itens[0].valorNoPeriodo).toBe(350);
  });

  it("não cobra item sem produção nova no período", () => {
    const r = calcularMedicao(
      entrada({ produzidoAcumulado: [{ budgetItemId: 1, quantity: 25 }] })
    );

    expect(r.itens).toHaveLength(0);
    expect(r.bruto).toBe(0);
    expect(r.avisos.join(" ")).toContain("Nada novo produzido");
  });

  it("ignora produção de item fora do orçamento aprovado", () => {
    const r = calcularMedicao(
      entrada({
        produzidoAcumulado: [
          { budgetItemId: 1, quantity: 60 },
          { budgetItemId: 99, quantity: 500 },
        ],
      })
    );

    expect(r.itens).toHaveLength(1);
    expect(r.totalContratado).toBe(1000);
    expect(r.bruto).toBe(350);
  });

  it("avisa quando o já medido passa do produzido, em vez de cobrar negativo", () => {
    const r = calcularMedicao(
      entrada({ medidoAcumuladoAnterior: [{ budgetItemId: 1, quantity: 80 }] })
    );

    expect(r.itens).toHaveLength(0);
    expect(r.bruto).toBe(0);
    expect(r.avisos.join(" ")).toContain("01.01");
    expect(r.avisos.join(" ")).toContain("80");
  });

  it("avisa e não valoriza item sem preço unitário", () => {
    const r = calcularMedicao(
      entrada({ itens: [{ ...escavacao, unitPrice: 0 }] })
    );

    expect(r.itens).toHaveLength(0);
    expect(r.bruto).toBe(0);
    expect(r.avisos.join(" ")).toContain("preço unitário");
    expect(r.avisos.join(" ")).not.toContain("Nada novo produzido");
  });

  it("marca item medido acima do contratado, sem esconder o excesso", () => {
    const r = calcularMedicao(
      entrada({
        produzidoAcumulado: [{ budgetItemId: 1, quantity: 120 }],
        medidoAcumuladoAnterior: [{ budgetItemId: 1, quantity: 90 }],
      })
    );

    expect(r.itens[0].quantidadeNoPeriodo).toBe(30);
    expect(r.itens[0].acimaDoContratado).toBe(true);
    expect(r.itens[0].saldoApos).toBe(-20);
    expect(r.avisos.join(" ")).toContain("passa do contratado");
  });

  it("arredonda quantidade em 3 casas e dinheiro em 2", () => {
    const r = calcularMedicao(
      entrada({
        itens: [{ ...escavacao, unitPrice: 33.33 }],
        produzidoAcumulado: [{ budgetItemId: 1, quantity: 3.3334 }],
        medidoAcumuladoAnterior: [],
      })
    );

    expect(r.itens[0].quantidadeNoPeriodo).toBe(3.333);
    // 3,333 × 33,33 = 111,08889
    expect(r.itens[0].valorNoPeriodo).toBe(111.09);
    expect(r.bruto).toBe(111.09);
  });

  it("soma itens diferentes e mantém a ordem do orçamento", () => {
    const r = calcularMedicao({
      itens: [
        escavacao,
        {
          budgetItemId: 2,
          code: "01.02",
          description: "Concreto fck 30",
          unit: "m3",
          quantity: 10,
          unitPrice: 500,
        },
      ],
      produzidoAcumulado: [
        { budgetItemId: 1, quantity: 60 },
        { budgetItemId: 2, quantity: 4 },
      ],
      medidoAcumuladoAnterior: [],
      retentionPercent: 5,
    });

    expect(r.itens.map(i => i.code)).toEqual(["01.01", "01.02"]);
    expect(r.bruto).toBe(600 + 2000);
    expect(r.retencao).toBe(130);
    expect(r.liquido).toBe(2470);
    expect(r.totalContratado).toBe(1000 + 5000);
    expect(r.saldoTotal).toBe(6000 - 2600);
  });

  it("sem itens no orçamento não inventa valor", () => {
    const r = calcularMedicao(entrada({ itens: [] }));

    expect(r.bruto).toBe(0);
    expect(r.liquido).toBe(0);
    expect(r.totalContratado).toBe(0);
    expect(r.avisos).toHaveLength(1);
  });
});

describe("máquina de estados da medição", () => {
  it("deixa rascunho virar aprovada direto (obra pequena não tem dupla aprovação)", () => {
    expect(podeTransicionar("rascunho", "aprovada")).toBe(true);
  });

  it("deixa voltar de em_aprovacao para rascunho", () => {
    expect(podeTransicionar("em_aprovacao", "rascunho")).toBe(true);
  });

  it("não deixa nota faturada voltar para aprovada", () => {
    expect(podeTransicionar("faturada", "aprovada")).toBe(false);
  });

  it("paga e cancelada são terminais", () => {
    expect(transicoesPermitidas("paga")).toEqual([]);
    expect(transicoesPermitidas("cancelada")).toEqual([]);
  });

  it("só cancela antes de faturar", () => {
    expect(podeTransicionar("aprovada", "cancelada")).toBe(true);
    expect(podeTransicionar("faturada", "cancelada")).toBe(false);
  });

  it("não pula de rascunho para paga", () => {
    expect(podeTransicionar("rascunho", "paga")).toBe(false);
  });
});

describe("validarPeriodo", () => {
  it("aceita período com fim depois do início", () => {
    expect(validarPeriodo("2026-02-01", "2026-02-28")).toBeNull();
  });

  it("recusa período de um dia só ou invertido", () => {
    expect(validarPeriodo("2026-02-01", "2026-02-01")).not.toBeNull();
    expect(validarPeriodo("2026-02-28", "2026-02-01")).not.toBeNull();
  });

  it("recusa data fora do formato ISO", () => {
    expect(validarPeriodo("01/02/2026", "2026-02-28")).not.toBeNull();
  });
});

describe("periodosSobrepostos", () => {
  it("detecta sobreposição no meio", () => {
    expect(periodosSobrepostos("2026-01-01", "2026-01-31", "2026-01-15", "2026-02-15")).toBe(true);
  });

  it("detecta sobreposição na borda — o dia 31 é dos dois", () => {
    expect(periodosSobrepostos("2026-01-01", "2026-01-31", "2026-01-31", "2026-02-15")).toBe(true);
  });

  it("aceita períodos vizinhos sem sobreposição", () => {
    expect(periodosSobrepostos("2026-01-01", "2026-01-31", "2026-02-01", "2026-02-28")).toBe(false);
  });
});
