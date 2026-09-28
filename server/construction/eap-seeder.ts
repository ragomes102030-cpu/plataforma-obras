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

import { eq } from "drizzle-orm";
import {
  priceCatalogs,
  priceItems,
  projects,
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
};

const CATALOGO_VAZIO: ResultadoDaSemeadura = {
  nosCriados: 0,
  servicosUsados: 0,
  servicosSemGrupo: 0,
  gruposVazios: [],
  catalogo: null,
  aviso: null,
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
  opcoes: { tipoDeObra?: TipoDeObra | string; fonte?: "SEINFRA" | "SINAPI" }
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

  const existentes = await db
    .select({ id: wbsNodes.id })
    .from(wbsNodes)
    .where(eq(wbsNodes.projectId, projectId))
    .limit(1);
  if (existentes.length) {
    return {
      ...CATALOGO_VAZIO,
      catalogo,
      aviso: "A obra já tem estrutura; nada foi gerado.",
    };
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

  return {
    nosCriados: gerado.nos.length,
    servicosUsados: gerado.servicosUsados,
    servicosSemGrupo: gerado.servicosSemGrupo,
    gruposVazios: gerado.gruposVazios,
    catalogo,
    aviso: gerado.aviso,
  };
}
