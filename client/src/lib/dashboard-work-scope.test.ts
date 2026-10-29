import { describe, expect, it } from "vitest";
import { classificarEstadoAtividadesDashboard, excluirAtividadesDeDemonstracao } from "./dashboard-work-scope";

describe("escopo da obra no painel executivo", () => {
  const linhas = [
    { codigo: "1.1", atividade: "Serviço real" },
    { codigo: "QA-1", atividade: "Atividade demonstrativa" },
  ];

  it("remove atividades marcadas como demonstração sem alterar as linhas de origem", () => {
    const resultado = excluirAtividadesDeDemonstracao(linhas, new Set(["QA-1"]));

    expect(resultado).toEqual([linhas[0]]);
    expect(linhas).toHaveLength(2);
  });

  it("preserva todas as atividades quando não há marcações de demonstração", () => {
    expect(excluirAtividadesDeDemonstracao(linhas, new Set())).toBe(linhas);
  });

  it("não chama de obra sem atividades enquanto o plano ainda carrega", () => {
    expect(classificarEstadoAtividadesDashboard({
      carregandoPlano: true,
      erroPlano: false,
      atividadesOperacionais: 0,
      atividadesNaGrade: 0,
    })).toBe("carregando");
  });

  it("distingue plano vazio de atividades existentes que não chegaram à grade", () => {
    const base = { carregandoPlano: false, erroPlano: false, atividadesNaGrade: 0 };

    expect(classificarEstadoAtividadesDashboard({ ...base, atividadesOperacionais: 0 })).toBe("sem-atividades");
    expect(classificarEstadoAtividadesDashboard({ ...base, atividadesOperacionais: 4 })).toBe("sem-grade");
  });

  it("não rotula falha de consulta como plano vazio", () => {
    expect(classificarEstadoAtividadesDashboard({
      carregandoPlano: false,
      erroPlano: true,
      atividadesOperacionais: 0,
      atividadesNaGrade: 0,
    })).toBe("erro");
  });
});
