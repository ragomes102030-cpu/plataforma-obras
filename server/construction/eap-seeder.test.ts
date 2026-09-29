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
  /** Versões de orçamento que já existem na obra. Alimenta o MAX+1. */
  versoes?: Linha[];
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
  const versoes = opcoes.versoes ?? [];
  const deletes: unknown[] = [];
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
    if (tabela === budgetVersions) return cadeia(() => versoes as Linha[]);
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
    delete: (tabela: unknown) => ({
      where: async () => {
        deletes.push(tabela);
        return undefined;
      },
    }),
  };

  return { db: db as never, inserts, deletes };
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
  /**
   * O seeder NÃO monta cronograma.
   *
   * Até a onda anterior ele criava uma atividade por folha, com
   * DURACAO_PADRAO_DIAS = 5 e startOffset encadeado, mais as dependências FS
   * entre elas. Eram 84 atividades que pareciam duração informada: apareciam
   * na grade com início, fim e um caminho crítico inteiro calculado sobre
   * elas.
   *
   * Catálogo gera ESCOPO; escopo não gera PRAZO. Estes testes existem para
   * ninguém reintroduzir a fabrication.
   */
  describe("o seeder não monta cronograma", () => {
    function atividadesGravadas(inserts: Array<{ tabela: unknown; valores: Linha[] }>) {
      return inserts.filter(i => i.tabela === scheduleActivities).flatMap(i => i.valores);
    }
    function dependenciasGravadas(inserts: Array<{ tabela: unknown; valores: Linha[] }>) {
      return inserts.filter(i => i.tabela === scheduleDependencies).flatMap(i => i.valores);
    }

    it("não cria nenhuma atividade", async () => {
      const { db, inserts } = dbFalso();
      const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      expect(atividadesGravadas(inserts)).toHaveLength(0);
      expect(dependenciasGravadas(inserts)).toHaveLength(0);
      expect(r.atividadesCriadas).toBe(0);
    });

    it("mesmo com muitas folhas do catálogo, o cronograma continua vazio", async () => {
      // A tentação é "só quando o catálogo é grande". Não. Quantidade de
      // serviços não é argumento para fabricar prazo.
      const itens = Array.from({ length: 60 }, (_, i) => ({
        code: `C${9000 + i}`,
        description: `SERVIÇO ${i}`,
        unit: "un",
        unitPrice: "10.00",
      }));
      const { db, inserts } = dbFalso({ itens });
      await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      expect(atividadesGravadas(inserts)).toHaveLength(0);
    });

    it("o orçamento continua nascendo com o preço do catálogo", async () => {
      // A EAP e o orçamento são derivados do catálogo e, por isso, corretos
      // sem intervenção. Eles continuam.
      const { db, inserts } = dbFalso();
      const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      const itens = inserts.find(i => i.tabela === budgetItems);
      expect(itens).toBeTruthy();
      expect(r.itensDeOrcamentoCriados).toBeGreaterThan(0);
      expect(r.nosCriados).toBeGreaterThan(0);
    });
  });
});

/**
 * Recuperação e versionamento.
 *
 * O botão "Gerar EAP do catálogo" grava em cinco tabelas. Duas propriedades
 * o tornam seguro, e ambas são testadas aqui:
 *
 *  1. `refazer` existe. A guarda de idempotência recusa sempre que há
 *     qualquer nó, e ela não distingue "estrutura inteira" de "metade de uma
 *     estrutura". Sem `refazer`, uma semeadura interrompida deixava a obra
 *     num estado sem botão, rota ou script que tirasse dali.
 *  2. A versão de orçamento é MAX + 1, e não 1 fixa. `budget_versions` tem
 *     índice único em (projectId, versionNumber), então a 1 fixa estourava
 *     ER_DUP_ENTRY em toda obra que já tivesse versão criada à mão.
 *
 * O que NÃO é testável aqui: a atomicidade. Ela vem do `db.transaction` na
 * mutation `generateEapFromCatalog`, e este drizzle falso não transaciona.
 */
describe("semeadura — recuperação e versionamento", () => {
  it("recusa obra com nós e aponta a saída", async () => {
    const { db, inserts } = dbFalso({ nosExistentes: [{ id: 1 }] });
    const r = await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });

    expect(inserts).toHaveLength(0);
    expect(r.aviso).toContain("já tem estrutura");
    // Quem ficou preso não adivinha que existe "Refazer" — a mensagem tem que
    // dizer. Um aviso que só recusa é beco sem saída com texto nicer.
    expect(r.aviso).toMatch(/Refazer/i);
  });

  it("refazer apaga a estrutura antes de gravar de novo", async () => {
    const { db, deletes, inserts } = dbFalso({ nosExistentes: [{ id: 1 }] });
    await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio", refazer: true });

    // Ordem importa: `wbs_nodes` é referenciado com `onDelete: "restrict"`,
    // então os nós têm de ser os últimos a sair.
    expect(deletes).toContain(scheduleDependencies);
    expect(deletes).toContain(scheduleActivities);
    expect(deletes).toContain(wbsNodes);
    expect(deletes.indexOf(wbsNodes)).toBeGreaterThan(deletes.indexOf(scheduleDependencies));
    expect(inserts.length).toBeGreaterThan(0);
  });

  it("sem refazer, não apaga nada", async () => {
    const { db, deletes } = dbFalso({ nosExistentes: [{ id: 1 }] });
    await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
    expect(deletes).toHaveLength(0);
  });

  it("pega a próxima versão quando a obra já tem a 1", async () => {
    const { db, inserts } = dbFalso({ versoes: [{ n: 1 }] });
    await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });

    const versoes = inserts.filter(i => i.tabela === budgetVersions);
    expect(versoes.length).toBeGreaterThan(0);
    expect(versoes[0]!.valores[0]!.versionNumber).toBe(2);
  });

  it("obra sem versão começa na 1", async () => {
    const { db, inserts } = dbFalso({ versoes: [] });
    await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });

    const versoes = inserts.filter(i => i.tabela === budgetVersions);
    expect(versoes[0]!.valores[0]!.versionNumber).toBe(1);
  });

  it("a versão nova é sempre maior que a última, e nunca a 1 fixa", async () => {
    // Este é o teste que trava o bug: obra com a versão 1 criada à mão no
    // Orçamento + catálogo importado + "Gerar EAP" => ER_DUP_ENTRY, e sem
    // transação a obra ficava com EAP e sem orçamento.
    for (const ultima of [1, 2, 7]) {
      const { db, inserts } = dbFalso({ versoes: [{ n: ultima }] });
      await semearEapDoCatalogo(db, 7, { tipoDeObra: "edificio" });
      const versoes = inserts.filter(i => i.tabela === budgetVersions);
      expect(versoes[0]!.valores[0]!.versionNumber, `ultima versão ${ultima}`).toBe(ultima + 1);
    }
  });
});
