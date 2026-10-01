import { describe, expect, it } from "vitest";
import { projects, scheduleActivities, scheduleDependencies, wbsNodes } from "../../drizzle/schema";
import { semearEapDoCatalogo } from "./eap-seeder";
import { templateDaEap } from "../../shared/eap-templates";

type Row = Record<string, unknown>;

function dbFalso(options: { existing?: Row[] } = {}) {
  const inserted: Row[] = [];
  const deleted: unknown[] = [];
  const existing = options.existing ?? [];
  let nextId = 1;

  const chain = (rows: Row[]) => {
    const api: any = {};
    api.where = () => api;
    api.orderBy = () => api;
    api.limit = async () => rows;
    api.then = (resolve: any, reject?: any) => Promise.resolve(rows).then(resolve, reject);
    return api;
  };

  const db: any = {
    select: (projection?: unknown) => ({
      from: (table: unknown) => {
        if (table === projects) return chain([{ name: "Obra Teste", descricao: "Edificação residencial" }]);
        if (table === wbsNodes) return chain(existing);
        return chain([]);
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Row) => ({
        $returningIds: async () => {
          const row = { ...values, id: nextId++ };
          inserted.push(row);
          return [{ id: row.id }];
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        deleted.push(table);
      },
    }),
  };

  return { db, inserted, deleted };
}

describe("semearEapDoCatalogo", () => {
  it("gera a EAP a partir do template e não do catálogo de preços", async () => {
    const { db, inserted } = dbFalso();
    const result = await semearEapDoCatalogo(db, 7, {
      tipoDeObra: "edificio",
      versionId: 3,
    });

    const template = templateDaEap("edificio");
    const expectedCount = 1 + template.length + template.reduce((sum, group) => sum + (group.children?.length ?? 0), 0);

    expect(result.nosCriados).toBe(expectedCount);
    expect(inserted).toHaveLength(expectedCount);
    expect(inserted[0]).toMatchObject({
      projectId: 7,
      versionId: 3,
      code: "1",
      nodeType: "grupo",
      decompositionBasis: "project",
      name: "Obra Teste",
    });
    expect(inserted.some(row => row.code === "1.1")).toBe(true);
    expect(inserted.every(row => row.projectId === 7 && row.versionId === 3)).toBe(true);
    expect(result.servicosUsados).toBe(0);
    expect(result.catalogo).toBeNull();
  });

  it("não recria uma EAP existente sem refazer", async () => {
    const { db, inserted } = dbFalso({ existing: [{ id: 10 }] });
    const result = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio", versionId: 3 });

    expect(result.nosCriados).toBe(0);
    expect(result.aviso).toContain("já possui uma EAP");
    expect(inserted).toHaveLength(0);
  });

  it("refaz a versão removendo EAP, atividades e dependências antes de gerar", async () => {
    const { db, inserted, deleted } = dbFalso({ existing: [{ id: 10 }] });
    const result = await semearEapDoCatalogo(db, 7, {
      tipoDeObra: "reforma",
      versionId: 4,
      refazer: true,
    });

    expect(result.nosCriados).toBeGreaterThan(0);
    expect(deleted).toEqual([scheduleDependencies, scheduleActivities, wbsNodes]);
    expect(inserted[0]).toMatchObject({ code: "1", projectId: 7, versionId: 4 });
  });

  it("usa o template solicitado e não transforma serviços do catálogo em nós EAP", async () => {
    const { db, inserted } = dbFalso();
    await semearEapDoCatalogo(db, 7, { tipoDeObra: "pavimentacao", versionId: 5 });

    const template = templateDaEap("pavimentacao");
    const nomesDoTemplate = template.flatMap(group => [group.name, ...(group.children ?? []).map(child => child.name)]);
    const nomesInseridos = inserted.slice(1).map(row => String(row.name));

    expect(nomesInseridos).toEqual(nomesDoTemplate);
    expect(inserted.some(row => String(row.name).includes("C10101"))).toBe(false);
  });
});
