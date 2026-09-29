/**
 * Semeia a EAP de uma obra a partir do catálogo de preços oficial ativo.
 *
 * A EAP nasce dos SERVIÇOS (`C...`) que o upload trouxe, não de uma tabela fixa
 * de pacotes. Ver `shared/eap-engine.ts` para o porquê: é o que garante que o
 * orçamento case com a EAP por identidade, e não por similaridade de texto.
 *
 * Cada folha grava o código oficial em `wbsNodes.externalId`, que já existe no
 * schema — por isso esta onda não precisa de migração.
 */

import { and, desc, eq, like } from "drizzle-orm";
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
import { getDb } from "../db";
import {
  gerarEap,
  type CategoriaDeObra,
  type TipoDeObra,
} from "../../shared/eap-engine";
import { extrairTrilha } from "../../shared/price-sources/seinfra";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ResultadoDaSemeadura = {
  /** Nós criados. Vazio quando não havia catálogo ou nada casou. */
  nosCriados: number;
  servicosUsados: number;
  servicosSemGrupo: number;
  gruposVazios: CategoriaDeObra[];
  /** Catálogo efetivamente usado, para a UI mostrar de onde veio. */
  catalogo: { id: number; nome: string; referencia: string; fonte: string } | null;
  /** Texto para a UI quando a EAP não pôde ser gerada. */
  aviso: string | null;
  /** Itens de orçamento criados junto com a EAP (preço do catálogo, quantidade 0). */
  itensDeOrcamentoCriados: number;
  /**
   * Atividades de cronograma criadas junto com a EAP, uma por folha, em
   * sequência FS. Duração de placeholder — ver `DURACAO_PADRAO_DIAS`.
   */
  atividadesCriadas: number;
};

/**
 * Duração inicial de cada atividade gerada, em dias. É um placeholder
 * explícito: sem quantitativo medido (a folha nasce com `quantity: 0`) não
 * há como calcular duração real (quantidade ÷ produtividade), e gravar um
 * número "realista" inventado seria pior do que um valor óbvio de ajustar.
 * O usuário edita a duração real assim que tiver o quantitativo e a equipe.
 */
export const DURACAO_PADRAO_DIAS = 5;

const CATALOGO_VAZIO: ResultadoDaSemeadura = {
  nosCriados: 0,
  servicosUsados: 0,
  servicosSemGrupo: 0,
  gruposVazios: [],
  catalogo: null,
  aviso: null,
  itensDeOrcamentoCriados: 0,
  atividadesCriadas: 0,
};

/**
 * Catálogo ativo: o mais recente da fonte pedida. A referência do projeto
 * (`baseReferenciaRef`) tem precedência quando casa com algum catálogo — é o
 * período que o usuário fixou para a obra.
 */
export async function catalogoAtivo(
  db: Db,
  fonte: "SEINFRA" | "SINAPI",
  referenciaPreferida: string | null | undefined
): Promise<{ id: number; nome: string; referencia: string; fonte: string } | null> {
  const rows = await db
    .select({
      id: priceCatalogs.id,
      name: priceCatalogs.name,
      sourceType: priceCatalogs.sourceType,
      referencePeriod: priceCatalogs.referencePeriod,
    })
    .from(priceCatalogs)
    .where(eq(priceCatalogs.sourceType, fonte));
  if (!rows.length) return null;
  const escolhido =
    (referenciaPreferida
      ? rows.find(r => r.referencePeriod === referenciaPreferida)
      : undefined) ?? rows[0];
  return {
    id: escolhido.id,
    nome: escolhido.name,
    referencia: escolhido.referencePeriod,
    fonte: escolhido.sourceType,
  };
}

/**
 * Gera e grava a EAP. Idempotente: se a obra já tiver qualquer nó, não faz
 * nada — evita duplicar a estrutura quando o usuário clica duas vezes.
 */
export async function semearEapDoCatalogo(
  db: Db,
  projectId: number,
  opcoes: {
    tipoDeObra?: TipoDeObra | string;
    fonte?: "SEINFRA" | "SINAPI";
    /**
     * Apaga o que uma semeadura anterior deixou pela metade e refaz.
     *
     * A guarda de idempotência abaixo recusa sempre que existe qualquer nó, e
     * ela existe para não duplicar estrutura quando o usuário clica duas
     * vezes. O problema é que ela não distingue "estrutura inteira" de "metade
     * de uma estrutura": uma semeadura interrompida deixa a obra num estado em
     * que o botão recusa, o segundo clique recusa, e não há rota, botão nem
     * script que tire a obra de lá. Com "refazer", esse estado tem saída.
     *
     * Apaga SOMENTE o que o seeder grava: a árvore de nós, as atividades e
     * dependências, e a versão de orçamento cujo nome segue o padrão daqui.
     * Uma versão de orçamento criada à mão não é tocada.
     */
    refazer?: boolean;
  }
): Promise<ResultadoDaSemeadura> {
  const fonte = opcoes.fonte ?? "SEINFRA";

  const [projeto] = await db
    .select({ baseReferenciaRef: projects.baseReferenciaRef })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const catalogo = await catalogoAtivo(db, fonte, projeto?.baseReferenciaRef);
  if (!catalogo) {
    return {
      ...CATALOGO_VAZIO,
      aviso: fonte === "SEINFRA"
        ? "Nenhuma base SEINFA importada ainda. Faça upload da planilha no Catálogo para gerar a EAP automaticamente."
        : "Nenhuma base SINAPI importada ainda.",
    };
  }

  if (opcoes.refazer) {
    // Ordem inversa da criação: dependências, atividades, itens, versão, nós.
    // Sem esta ordem o `onDelete: "restrict"` dos nós bloqueia a limpeza.
    await db
      .delete(scheduleDependencies)
      .where(eq(scheduleDependencies.projectId, projectId));
    await db
      .delete(scheduleActivities)
      .where(eq(scheduleActivities.projectId, projectId));

    const versoesDoSeeder = await db
      .select({ id: budgetVersions.id })
      .from(budgetVersions)
      .where(
        and(
          eq(budgetVersions.projectId, projectId),
          like(budgetVersions.name, "Orçamento — preços do catálogo%")
        )
      );
    for (const v of versoesDoSeeder) {
      await db.delete(budgetItems).where(eq(budgetItems.budgetVersionId, v.id));
      await db.delete(budgetVersions).where(eq(budgetVersions.id, v.id));
    }

    await db.delete(wbsNodes).where(eq(wbsNodes.projectId, projectId));
  } else {
    const existentes = await db
      .select({ id: wbsNodes.id })
      .from(wbsNodes)
      .where(eq(wbsNodes.projectId, projectId))
      .limit(1);
    if (existentes.length) {
      return {
        ...CATALOGO_VAZIO,
        catalogo,
        aviso:
          "A obra já tem estrutura; nada foi gerado. Se esta estrutura veio de uma geração interrompida, use 'Refazer' para recomeçar do zero.",
      };
    }
  }

  const servicos = await db
    .select({
      code: priceItems.code,
      description: priceItems.description,
      unit: priceItems.unit,
      unitPrice: priceItems.unitPrice,
      notes: priceItems.notes,
    })
    .from(priceItems)
    .where(eq(priceItems.catalogId, catalogo.id));

  const gerado = gerarEap(
    servicos.map(s => ({
      code: s.code,
      description: s.description,
      unit: s.unit,
      unitPrice: Number(s.unitPrice),
      // A trilha (capítulo > subgrupo da planilha oficial) é o que faz a
      // classificação acertar; sem ela o motor cai na palavra solta e põe a
      // peça na ala errada. O importador a gravou em `notes` ao ler a planilha
      // — ver `extrairTrilha` em shared/price-sources/seinfra.ts.
      trilha: extrairTrilha(s.notes),
    })),
    { tipoDeObra: opcoes.tipoDeObra }
  );

  if (!gerado.nos.length) {
    return {
      ...CATALOGO_VAZIO,
      catalogo,
      servicosSemGrupo: gerado.servicosSemGrupo,
      gruposVazios: gerado.gruposVazios,
      aviso: gerado.aviso ?? "Nenhum serviço do catálogo casou com este tipo de obra.",
    };
  }

  // Insere em duas passadas: primeiro os grupos, para ter o id do pai antes de
  // gravar as folhas (o pai é NOT NULL e referenciado).
  const idPorCodigo = new Map<string, number>();
  for (const no of gerado.nos.filter(n => n.level === 1)) {
    const [row] = await db
      .insert(wbsNodes)
      .values({
        projectId,
        code: no.code,
        name: no.name,
        level: no.level,
        nodeType: no.nodeType,
        parentId: null,
        sortOrder: no.sortOrder,
      })
      .$returningId();
    idPorCodigo.set(no.code, row.id);
  }

  for (const no of gerado.nos.filter(n => n.level > 1)) {
    const codigoPai = no.code.split(".").slice(0, -1).join(".");
    const parentId = idPorCodigo.get(codigoPai);
    if (!parentId) continue; // pai ausente: melhor perder a folha que gravar órfã
    const [row] = await db
      .insert(wbsNodes)
      .values({
        projectId,
        code: no.code,
        name: no.name,
        level: no.level,
        nodeType: no.nodeType,
        parentId,
        // O código oficial do serviço. É isto que amarra o orçamento à EAP.
        externalId: no.externalId,
        unit: no.unit,
        sortOrder: no.sortOrder,
      })
      .$returningId();
    idPorCodigo.set(no.code, row.id);
  }

  // O orçamento nasce junto da EAP, folha a folha: mesmo código oficial,
  // mesmo preço do catálogo (`unitPrice` já vem calculado pelo motor). A
  // quantidade fica em 0 de propósito — só quem mede o projeto sabe o
  // quantitativo real, e gravar um número inventado seria pior do que
  // deixar em branco. Sem isto, o orçamento nascia sempre "sem preços"
  // mesmo quando o catálogo já tinha o preço disponível.
  const folhas = gerado.nos.filter(n => n.nodeType === "entrega" && n.externalId);
  let itensDeOrcamentoCriados = 0;
  const budgetItemIdPorCodigo = new Map<string, number>();
  if (folhas.length) {
    // MAX + 1, e não 1 fixo: `budget_versions` tem índice único em
    // (projectId, versionNumber). Caminho curto para o bug: obra criada sem
    // catálogo, o usuário abre o Orçamento e cria a versão 1 à mão, importa o
    // catálogo e clica em "Gerar EAP" — os nós entram e este insert estoura
    // ER_DUP_ENTRY. `createVersion` e `ensureVersion` em routers.ts já faziam
    // MAX + 1; a regra foi aplicada nos dois caminhos irmãos e esquecida aqui.
    const [ultima] = await db
      .select({ n: budgetVersions.versionNumber })
      .from(budgetVersions)
      .where(eq(budgetVersions.projectId, projectId))
      .orderBy(desc(budgetVersions.versionNumber))
      .limit(1);
    const proximaVersao = (ultima?.n ?? 0) + 1;

    const [versao] = await db
      .insert(budgetVersions)
      .values({
        projectId,
        name: `Orçamento — preços do catálogo ${catalogo.nome} (${catalogo.referencia})`,
        versionNumber: proximaVersao,
        status: "rascunho",
        currency: "BRL",
        notes:
          "Preço unitário vem do catálogo importado; quantidade ainda não foi medida e está em 0 — preencher antes de aprovar.",
      })
      .$returningId();
    const linhasInseridas = await db
      .insert(budgetItems)
      .values(
        folhas.map(no => ({
          budgetVersionId: versao.id,
          wbsNodeId: idPorCodigo.get(no.code) ?? null,
          code: no.externalId!,
          description: no.name,
          unit: no.unit ?? "un",
          quantity: "0.000",
          unitPrice: (no.unitPrice ?? 0).toFixed(2),
          source: catalogo.fonte,
          referencePeriod: catalogo.referencia,
          sortOrder: no.sortOrder,
        }))
      )
      .$returningId();
    folhas.forEach((no, index) => {
      const id = linhasInseridas[index]?.id;
      if (id) budgetItemIdPorCodigo.set(no.code, id);
    });
    itensDeOrcamentoCriados = folhas.length;
  }

  // O cronograma nasce junto: uma atividade por folha, ligada ao mesmo
  // wbsNode e à mesma linha de orçamento (`budgetItemId`) — é o que faz
  // Gantt, Orçamento e EAP mostrarem a mesma obra, em vez de três estruturas
  // que por acaso têm nomes parecidos. `phase` vem do grupo que a contém,
  // para a Linha de Balanço e os filtros por frente terem o que agrupar.
  // Encadeadas em FS simples dentro do grupo (a única ordem que dá para
  // inferir sem saber a obra); dá pra reordenar depois no Gantt.
  let atividadesCriadas = 0;
  if (folhas.length) {
    const nomeDoGrupoPorCodigo = new Map<string, string>();
    for (const no of gerado.nos.filter(n => n.level === 1)) {
      nomeDoGrupoPorCodigo.set(no.code, no.name);
    }
    let offset = 0;
    const atividadesParaInserir = folhas.map(no => {
      const codigoGrupo = no.code.split(".").slice(0, -1).join(".");
      const linha = {
        projectId,
        wbsNodeId: idPorCodigo.get(no.code)!,
        externalId: no.externalId,
        wbsCode: no.code,
        name: no.name,
        phase: nomeDoGrupoPorCodigo.get(codigoGrupo) ?? "Geral",
        startOffset: offset,
        durationDays: DURACAO_PADRAO_DIAS,
        budgetItemId: budgetItemIdPorCodigo.get(no.code) ?? null,
        progress: 0,
        status: "Não iniciado" as const,
        critical: 0,
        sortOrder: no.sortOrder,
      };
      offset += DURACAO_PADRAO_DIAS;
      return linha;
    });
    const inseridas = await db
      .insert(scheduleActivities)
      .values(atividadesParaInserir)
      .$returningId();
    if (inseridas.length > 1) {
      await db.insert(scheduleDependencies).values(
        inseridas.slice(0, -1).map((atividade, index) => ({
          projectId,
          predecessorId: atividade.id,
          successorId: inseridas[index + 1].id,
          type: "FS" as const,
          lag: 0,
        }))
      );
    }
    atividadesCriadas = inseridas.length;
  }

  return {
    nosCriados: gerado.nos.length,
    servicosUsados: gerado.servicosUsados,
    servicosSemGrupo: gerado.servicosSemGrupo,
    gruposVazios: gerado.gruposVazios,
    catalogo,
    aviso: gerado.aviso,
    itensDeOrcamentoCriados,
    atividadesCriadas,
  };
}
