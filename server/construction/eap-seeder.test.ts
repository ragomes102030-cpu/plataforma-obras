import { describe, expect, it } from "vitest";
import { priceCatalogs, priceItems, projects, wbsNodes } from "../../drizzle/schema";
import { semearEapDoCatalogo, type ResultadoDaSemeadura } from "./eap-seeder";

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
  const inserts: Array<{ tabela: unknown; valores: Linha[]; ids: number[] }> = [];
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
        // O id só existe no retorno de `$returningId`, e é ele que o
        // `parentId` da folha referencia — então o falso guarda os dois juntos.
        const ids = lista.map(() => proximoId++);
        inserts.push({ tabela, valores: lista, ids });
        return { $returningId: async () => ids.map(id => ({ id })) };
      };
      return { values: registrar, $returningId: async () => [{ id: proximoId++ }] };
    },
  };

  return { db: db as never, inserts };
}

describe("semearEapDoCatalogo", () => {
  /** Todos os nós gravados, achatando os inserts, com o id que o banco deu. */
  function nosGravados(inserts: Array<{ tabela: unknown; valores: Linha[]; ids: number[] }>) {
    return inserts
      .filter(i => i.tabela === wbsNodes)
      .flatMap(i => i.valores.map((v, indice) => ({ ...v, _id: i.ids[indice] })));
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

  it("a trilha de notes decide o grupo, nao a palavra da descricao", async () => {
    // Estas descricoes, lidas sem a trilha, caem em grupos errados: "CABO"
    // leva protensao para Instalacoes e "DISJUNTOR ... NA PORTA DO Q.D." leva
    // para Revestimentos. A trilha gravada em `notes` pelo importador e o que
    // corrige, e ela precisa chegar viva do banco ate o motor.
    const itens = [
      {
        code: "C3334",
        description: "ANCORAGEM ATIVA PARA CABO COM 6 CORDOALHA DE 12,7mm",
        unit: "un",
        unitPrice: "667.28",
        notes: "item 6.6.81 | FUNDAÇÕES E  ESTRUTURAS > ARMADURAS",
      },
      {
        code: "C2266",
        description: "DISJUNTOR TRIPOLAR C/ACIONAMENTO NA PORTA DO Q.D.ATE 63A",
        unit: "un",
        unitPrice: "98.00",
        notes:
          "item 18.8.81 | INST. ELÉTRICAS, TELEFONIA, LÓGICA, SOM E SISTEMAS DE CONTROLE > BASES, CHAVES E DISJUNTORES",
      },
      {
        code: "C2820",
        description: "EXECUÇÃO DE SONDAGEM ELÉTRICA VERTICAL AB/2 ATÉ 150m - SEV",
        unit: "un",
        unitPrice: "623.05",
        notes: "item 1.1.1 | SERVICOS PRELIMINARES > SONDAGENS",
      },
    ];
    const { db, inserts } = dbFalso({ itens });
    const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    expect(r.servicosUsados).toBe(3);

    const nos = nosGravados(inserts);
    const paiDe = (codigo: string) => {
      const folha = nos.find(v => v.externalId === codigo);
      return nos.find(v => v._id === folha?.parentId)?.name;
    };
    expect(paiDe("C3334")).toBe("Estrutura");
    expect(paiDe("C2266")).toBe("Instalações e redes");
    expect(paiDe("C2820")).toBe("Serviços preliminares e mobilização");
    // E o nome da folha e a descricao limpa, sem o capitulo prefixado.
    const folhaC2820 = nos.find(v => v.externalId === "C2820");
    expect(folhaC2820?.name).toBe(
      "EXECUÇÃO DE SONDAGEM ELÉTRICA VERTICAL AB/2 ATÉ 150m - SEV"
    );
  });

  it("item sem trilha ainda classifica pela descricao", async () => {
    // Catalogo de cadastro manual: nao tem `notes` com hierarquia, e nao pode
    // ficar sem EAP por causa disso.
    const { db, inserts } = dbFalso();
    const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    expect(r.servicosUsados).toBeGreaterThan(0);
    expect(nosGravados(inserts).filter(v => v.level === 2).length).toBe(
      r.servicosUsados
    );
  });
});
