import { describe, expect, it } from "vitest";
import { ABAS } from "./abas";
import { GRUPOS_DA_SIDEBAR } from "./navegacao-sidebar";

describe("hierarquia da navegação da obra", () => {
  const ids = GRUPOS_DA_SIDEBAR.flatMap(grupo => grupo.ids);

  it("coloca cada aba em um único grupo e não deixa destinos órfãos", () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ABAS.map(aba => aba.id).sort());
  });

  it("separa planejamento, cronograma, custos, execução e governança", () => {
    const grupoDe = (id: string) => GRUPOS_DA_SIDEBAR.find(grupo => grupo.ids.includes(id))?.titulo;
    expect(grupoDe("escopo")).toBe("PLANEJAMENTO");
    expect(grupoDe("gantt")).toBe("CRONOGRAMA");
    expect(grupoDe("financeiro")).toBe("CUSTOS E FINANÇAS");
    expect(grupoDe("producao")).toBe("EXECUÇÃO E CONTROLE");
    expect(grupoDe("riscos")).toBe("GOVERNANÇA");
    expect(grupoDe("documentos")).toBe("GOVERNANÇA");
  });

  it("não anuncia cadastro de riscos como pronto enquanto não há persistência", () => {
    expect(ABAS.find(aba => aba.id === "riscos")).toMatchObject({
      status: "pendente",
      falta: expect.stringContaining("persistente"),
    });
  });
});
