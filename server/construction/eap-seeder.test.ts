import { describe, expect, it } from "vitest";
import {
  budgetItems,
  budgetVersions,
  priceCatalogs,
  priceItems,
  projects,
  scheduleActivities,
  scheduleDependencies,
  wbsNodes,
} from "../../drizzle/schema";
import {
  DURACAO_PADRAO_DIAS,
  semearEapDoCatalogo,
  type ResultadoDaSemeadura,
} from "./eap-seeder";

/**
 * Testa o gravador da EAP com um drizzle falso.
 *
 * O motor puro (`shared/eap-engine.ts`) ja tem 33 testes. O que se verifica
 * aqui e a parte que o motor nao alcanca: que a folha vai para `wbs_nodes` com
 * o codigo oficial em `externalId`, e com o pai certo. E o `externalId` que e
 * o ponto — e ele que amarra o orcamento a EAP.
 */
type Linha = Record<string, unknown>;

function dbFalso(opcoes: {
  catalogos?: Linha[];
  itens?: Linha[];
  nosExistentes?: Linha[];
  projetoRef?: string | null;
} = {}) {
  const inserts: Array<{ tabela: unknown; valores: Linha[] }> = [];
  const catalogo = {
    id: 1,
    name: "SEINFRA-CE 028.1",
    referencePeriod: "028.1",
    sourceType: "SEINFRA",
  };
  const catalogos = opcoes.catalogos === undefined ? [catalogo] : opcoes.catalogos;
  const itens = opcoes.itens ?? [
    { code: "C10101", description: "Instalação de canteiro", unit: "un", unitPrice: "4200.00" },
    { code: "C20101", description: "Escavação de vala", unit: "m3", unitPrice: "38.50" },
    { code: "C30101", description: "Concreto armado para estrutura", unit: "m3", unitPrice: "487.32" },
    { code: "C40101", description: "Alvenaria de bloco cerâmico", unit: "m2", unitPrice: "74.50" },
    { code: "C50101", description: "Instalação elétrica predial", unit: "m2", unitPrice: "22.70" },
    { code: "C60101", description: "Piso cerâmico", unit: "m2", unitPrice: "96.20" },
    { code: "I10101", description: "Cimento CP II", unit: "sc", unitPrice: "38.90" },
  ];
  const nosExistentes = opcoes.nosExistentes ?? [];
  let proximoId = 1;

  // A cadeia do drizzle e preguicosa e a mesma query pode parar em `.where()`,
  // `.orderBy()` ou `.limit()`; este falso aceita as tres e e awaitable, como
  // o drizzle real.
  const cadeia = (final: () => Linha[]) => {
    const passo = () => b;
    const b: Record<string, unknown> = {};
    b.where = passo;
    b.orderBy = passo;
    b.limit = async () => final();
    b.then = (onFulfilled?: (v: Linha[]) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(final()).then(onFulfilled, onRejected);
    return b;
  };

  // O drizzle aceita `select()` e `select({ projecao })`; a tabela vem no
  // `from()`. Este falso so precisa do `from`.
  const doFrom = (tabela?: unknown) => {
    if (tabela === priceCatalogs) return cadeia(() => catalogos as Linha[]);
    if (tabela === priceItems) return cadeia(() => itens as Linha[]);
    if (tabela === wbsNodes) return cadeia(() => nosExistentes as Linha[]);
    if (tabela === projects) {
      return cadeia(() => [{ baseReferenciaRef: opcoes.projetoRef ?? null }] as Linha[]);
    }
    throw new Error(`from() recebeu tabela inesperada: ${String(tabela)}`);
  };

  const db = {
    select: () => ({ from: doFrom }),
    insert: (tabela: unknown) => {
      const registrar = (vals: Linha | Linha[]) => {
        const lista = Array.isArray(vals) ? vals : [vals];
        // Uma chamada de `values()` é UM insert em lote, como o drizzle faz.
        inserts.push({ tabela, valores: lista });
        return { $returningId: async () => lista.map(() => ({ id: proximoId++ })) };
      };
      return { values: registrar, $returningId: async () => [{ id: proximoId++ }] };
    },
  };

  return { db: db as never, inserts };
}

describe("semearEapDoCatalogo", () => {
  /** Todos os nós gravados, achatando os inserts. */
  function nosGravados(inserts: Array<{ tabela: unknown; valores: Linha[] }>) {
    return inserts
      .filter(i => i.tabela === wbsNodes)
      .flatMap(i => i.valores);
  }

  it("grava grupos antes das folhas, porque o pai e NOT NULL", async () => {
    const { db, inserts } = dbFalso();
    const r: ResultadoDaSemeadura = await semearEapDoCatalogo(db, 7, {
      tipoDeObra: "edificio",
    });
    expect(r.nosCriados).toBeGreaterThan(0);

    const nos = nosGravados(inserts);
    const grupos = nos.filter(v => v.level === 1);
    const folhas = nos.filter(v => v.level === 2);
    expect(grupos.length).toBeGreaterThan(0);
    expect(folhas.length).toBeGreaterThan(0);
    expect(grupos.every(v => v.parentId === null)).toBe(true);
    expect(folhas.every(v => typeof v.parentId === "number")).toBe(true);

    // Toda folha vem depois do seu grupo na sequência de inserção.
    const primeiraFolha = nos.findIndex(v => v.level === 2);
    const ultimoGrupo = nos.reduce((acc, v, i) => (v.level === 1 ? i : acc), -1);
    expect(ultimoGrupo, "nenhum grupo gravado antes das folhas").toBeLessThan(primeiraFolha);
  });

  it("a folha grava o codigo oficial em externalId", async () => {
    const { db, inserts } = dbFalso();
    await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    const comCodigo = nosGravados(inserts).filter(v => v.externalId);
    expect(comCodigo.length).toBeGreaterThan(0);
    for (const f of comCodigo) {
      expect(String(f.externalId), "externalId tem de ser um codigo C... da SEINFRA").toMatch(
        /^C\d/i
      );
    }
  });

  it("o parentId aponta para um grupo realmente gravado", async () => {
    const { db, inserts } = dbFalso();
    await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    // Os ids sao sequenciais a partir de 1, na ordem de insercao.
    const nos = nosGravados(inserts);
    const totalGrupos = nos.filter(v => v.level === 1).length;
    const idsGrupos = new Set(
      Array.from({ length: totalGrupos }, (_, i) => i + 1)
    );
    for (const f of nos.filter(v => v.level === 2)) {
      expect(idsGrupos.has(Number(f.parentId)), `parentId ${f.parentId} não existe`).toBe(true);
    }
  });

  it("a folha carrega a unidade do catalogo", async () => {
    const { db, inserts } = dbFalso();
    await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    const unidades = nosGravados(inserts)
      .filter(v => v.level === 2)
      .map(v => v.unit);
    expect(unidades.filter(Boolean).length).toBeGreaterThan(0);
  });

  it("usa o periodo do projeto quando ele casa com um catalogo", async () => {
    const c1 = { id: 1, name: "Antigo", referencePeriod: "027.1", sourceType: "SEINFRA" };
    const c2 = { id: 2, name: "Vigente", referencePeriod: "028.1", sourceType: "SEINFRA" };
    const { db, inserts } = dbFalso({ catalogos: [c1, c2], projetoRef: "028.1" });
    const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    expect(r.catalogo?.referencia).toBe("028.1");
    expect(nosGravados(inserts).length).toBeGreaterThan(0);
  });

  it("sem catalogo avisa e nao grava nada", async () => {
    const { db, inserts } = dbFalso({ catalogos: [] });
    const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    expect(r.nosCriados).toBe(0);
    expect(r.aviso).toContain("SEINFA");
    expect(inserts).toHaveLength(0);
  });

  it("obra que ja tem nao-node nao ganha estrutura duplicada", async () => {
    const { db, inserts } = dbFalso({ nosExistentes: [{ id: 99 }] });
    const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    expect(r.nosCriados).toBe(0);
    expect(r.aviso).toContain("já tem estrutura");
    expect(inserts).toHaveLength(0);
  });

  it("so usa servicos: insumo I nunca vira folha", async () => {
    const { db, inserts } = dbFalso();
    await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    const codigos = nosGravados(inserts)
      .filter(v => v.level === 2)
      .map(v => String(v.externalId));
    expect(codigos).not.toContain("I10101");
  });

  it("catalogo so com insumos avisa, sem gravar meia estrutura", async () => {
    const { db, inserts } = dbFalso({
      itens: [{ code: "I10101", description: "Cimento CP II", unit: "sc", unitPrice: "38.90" }],
    });
    const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    expect(r.nosCriados).toBe(0);
    expect(r.aviso).toBeTruthy();
    expect(inserts).toHaveLength(0);
  });

  // O orçamento tem de nascer junto da EAP: antes desta onda, `budget_items`
  // nunca era gravado por este caminho e a obra ficava com "Orçamento: sem
  // preços" mesmo quando o catálogo já tinha o preço de cada serviço.
  describe("orçamento nasce junto da EAP", () => {
    function itensGravados(inserts: Array<{ tabela: unknown; valores: Linha[] }>) {
      return inserts.filter(i => i.tabela === budgetItems).flatMap(i => i.valores);
    }
    function versoesGravadas(inserts: Array<{ tabela: unknown; valores: Linha[] }>) {
      return inserts.filter(i => i.tabela === budgetVersions).flatMap(i => i.valores);
    }

    it("cria uma linha de orçamento por folha, com o preço do catálogo", async () => {
      const { db, inserts } = dbFalso();
      const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      const itens = itensGravados(inserts);
      // Uma linha por folha (nível 2), nenhuma para os grupos (nível 1).
      const folhasNaEap = nosGravados(inserts).filter(v => v.level === 2).length;
      expect(itens.length).toBe(folhasNaEap);
      expect(r.itensDeOrcamentoCriados).toBe(folhasNaEap);
      for (const item of itens) {
        expect(Number(item.unitPrice)).toBeGreaterThan(0);
        expect(item.quantity).toBe("0.000");
        expect(String(item.code)).toMatch(/^C\d/i);
      }
    });

    it("a linha do orçamento aponta para o nó da EAP que a originou", async () => {
      const { db, inserts } = dbFalso();
      await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      const nos = nosGravados(inserts);
      const idsDeFolha = new Set(
        nos
          .map((_, i) => i + 1)
          .filter(id => nos[id - 1]?.level === 2)
      );
      for (const item of itensGravados(inserts)) {
        expect(idsDeFolha.has(Number(item.wbsNodeId))).toBe(true);
      }
    });

    it("cria uma única versão de orçamento (rascunho) por semeadura", async () => {
      const { db, inserts } = dbFalso();
      await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      const versoes = versoesGravadas(inserts);
      expect(versoes).toHaveLength(1);
      expect(versoes[0].status).toBe("rascunho");
    });

    it("sem catálogo, não cria orçamento nenhum", async () => {
      const { db, inserts } = dbFalso({ catalogos: [] });
      const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      expect(r.itensDeOrcamentoCriados).toBe(0);
      expect(itensGravados(inserts)).toHaveLength(0);
    });
  });

  // O cronograma tinha o mesmo buraco que o orçamento: `scheduleActivities`
  // só nascia do plano-modelo genérico (`seedStarterPlan`), nunca da EAP real
  // gerada do catálogo. Por isso toda obra ficava sem Gantt até alguém clicar
  // em "inicializar plano" — e aí ganhava um cronograma sem nenhuma relação
  // com a estrutura que acabara de ser criada.
  describe("cronograma nasce junto da EAP", () => {
    function atividadesGravadas(inserts: Array<{ tabela: unknown; valores: Linha[] }>) {
      return inserts.filter(i => i.tabela === scheduleActivities).flatMap(i => i.valores);
    }
    function dependenciasGravadas(inserts: Array<{ tabela: unknown; valores: Linha[] }>) {
      return inserts.filter(i => i.tabela === scheduleDependencies).flatMap(i => i.valores);
    }

    it("cria uma atividade por folha, uma para cada linha de orçamento", async () => {
      const { db, inserts } = dbFalso();
      const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      const atividades = atividadesGravadas(inserts);
      expect(atividades.length).toBe(r.itensDeOrcamentoCriados);
      expect(r.atividadesCriadas).toBe(atividades.length);
    });

    it("cada atividade aponta para o nó da EAP e para a linha de orçamento certos", async () => {
      const { db, inserts } = dbFalso();
      await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      const nos = nosGravados(inserts).map((v, i) => ({ ...v, id: i + 1 }));
      const itens = inserts
        .filter(i => i.tabela === budgetItems)
        .flatMap(i => i.valores)
        // +1 pela versão de orçamento, que consome um id antes das linhas.
        .map((v, i) => ({ ...v, id: nos.length + 2 + i }));
      for (const atividade of atividadesGravadas(inserts)) {
        const no = nos.find(n => n.id === atividade.wbsNodeId);
        expect(no).toBeTruthy();
        expect(no?.level).toBe(2);
        expect(atividade.wbsCode).toBe(no?.code);
        const item = itens.find(i => i.id === atividade.budgetItemId);
        expect(item?.code).toBe(no?.externalId);
      }
    });

    it("usa a duração padrão e encadeia os offsets sem sobreposição", async () => {
      const { db, inserts } = dbFalso();
      await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      const atividades = atividadesGravadas(inserts) as Array<{
        startOffset: number;
        durationDays: number;
      }>;
      atividades.forEach((atividade, index) => {
        expect(atividade.durationDays).toBe(DURACAO_PADRAO_DIAS);
        expect(atividade.startOffset).toBe(index * DURACAO_PADRAO_DIAS);
      });
    });

    it("encadeia as atividades em FS, n-1 dependências para n atividades", async () => {
      const { db, inserts } = dbFalso();
      await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      const atividades = atividadesGravadas(inserts);
      const deps = dependenciasGravadas(inserts);
      expect(deps.length).toBe(Math.max(0, atividades.length - 1));
      expect(deps.every(d => d.type === "FS" && d.lag === 0)).toBe(true);
    });

    it("sem catálogo, não cria cronograma nenhum", async () => {
      const { db, inserts } = dbFalso({ catalogos: [] });
      const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      expect(r.atividadesCriadas).toBe(0);
      expect(atividadesGravadas(inserts)).toHaveLength(0);
      expect(dependenciasGravadas(inserts)).toHaveLength(0);
    });
  });
});
