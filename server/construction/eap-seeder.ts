/**
 * Geração da EAP canônica a partir do escopo/template da obra.
 *
 * Regra arquitetural:
 *   escopo → EAP → dicionário/pacotes → quantitativos → orçamento → cronograma
 *
 * Catálogos (SEINFRA/SINAPI) NÃO definem a árvore. Eles entram posteriormente
 * como fonte de preços, serviços, composições e apoio ao orçamento.
 */

import { and, eq } from "drizzle-orm";
import { projects, scheduleActivities, scheduleDependencies, wbsNodes } from "../../drizzle/schema";
import { templateDaEap, type TemplateEapNode, type TipoTemplateEap } from "../../shared/eap-templates";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export type ResultadoDaSemeadura = {
  nosCriados: number;
  servicosUsados: 0;
  servicosSemGrupo: 0;
  gruposVazios: [];
  catalogo: null;
  aviso: string | null;
  itensDeOrcamentoCriados: 0;
  atividadesCriadas: 0;
  template: TipoTemplateEap;
};

export async function semearEapDoCatalogo(
  db: Db,
  projectId: number,
  opcoes: { tipoDeObra?: TipoTemplateEap | string; versionId: number; refazer?: boolean }
): Promise<ResultadoDaSemeadura> {
  const [projeto] = await db
    .select({ name: projects.name, descricao: projects.descricao })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const tipo = (opcoes.tipoDeObra ?? "edificio") as TipoTemplateEap;
  const template = templateDaEap(tipo);

  const [existenteAntes] = await db
    .select({ id: wbsNodes.id })
    .from(wbsNodes)
    .where(and(eq(wbsNodes.projectId, projectId), eq(wbsNodes.versionId, opcoes.versionId)))
    .limit(1);

  if (opcoes.refazer) {
    await db.delete(scheduleDependencies).where(
      and(eq(scheduleDependencies.projectId, projectId), eq(scheduleDependencies.versionId, opcoes.versionId))
    );
    await db.delete(scheduleActivities).where(
      and(eq(scheduleActivities.projectId, projectId), eq(scheduleActivities.versionId, opcoes.versionId))
    );
    await db.delete(wbsNodes).where(
      and(eq(wbsNodes.projectId, projectId), eq(wbsNodes.versionId, opcoes.versionId))
    );
  } else if (existenteAntes) {
    return {
      nosCriados: 0,
      servicosUsados: 0,
      servicosSemGrupo: 0,
      gruposVazios: [],
      catalogo: null,
      aviso: "A versão de trabalho já possui uma EAP. Use 'Refazer' para reconstruir a estrutura.",
      itensDeOrcamentoCriados: 0,
      atividadesCriadas: 0,
      template: tipo,
    };
  }

  const raiz = await inserirNo(
    db, projectId, opcoes.versionId, null, "1",
    {
      name: projeto?.name?.trim() || "Escopo da obra",
      nodeType: "grupo",
      decompositionBasis: "project",
      description: projeto?.descricao?.trim() || "Escopo consolidado da obra. Revisar e complementar com documentos e requisitos do projeto.",
      inclusions: "Todo o escopo contratado e necessário para entregar a obra.",
      exclusions: "Trabalhos explicitamente fora do escopo contratado.",
      acceptanceCriteria: "Escopo da obra identificado, delimitado e aprovado antes da baseline.",
    },
    0
  );

  let total = 1;
  let ordem = 0;

  for (let i = 0; i < template.length; i++) {
    const grupo = template[i]!;
    const codigoGrupo = "1." + (i + 1);
    const grupoId = await inserirNo(db, projectId, opcoes.versionId, raiz, codigoGrupo, grupo, ordem++);
    total += 1;

    for (let j = 0; j < (grupo.children ?? []).length; j++) {
      const child = grupo.children![j]!;
      const codigo = codigoGrupo + "." + (j + 1);
      await inserirNo(db, projectId, opcoes.versionId, grupoId, codigo, child, ordem++);
      total += 1;
    }
  }

  return {
    nosCriados: total,
    servicosUsados: 0,
    servicosSemGrupo: 0,
    gruposVazios: [],
    catalogo: null,
    aviso: null,
    itensDeOrcamentoCriados: 0,
    atividadesCriadas: 0,
    template: tipo,
  };
}

async function inserirNo(
  db: Db,
  projectId: number,
  versionId: number,
  parentId: number | null,
  code: string,
  node: TemplateEapNode,
  sortOrder: number
): Promise<number> {
  const [row] = await db
    .insert(wbsNodes)
    .values({
      projectId,
      versionId,
      parentId,
      code,
      name: node.name,
      description: node.description,
      inclusions: node.inclusions,
      exclusions: node.exclusions,
      acceptanceCriteria: node.acceptanceCriteria,
      decompositionBasis: node.decompositionBasis,
      scopeStatus: "rascunho",
      level: code.split(".").length,
      nodeType: node.nodeType,
      unit: null,
      plannedQuantity: null,
      sortOrder,
    })
    .$returningIds();

  if (!row) throw new Error("Não foi possível criar o nó EAP " + code + ".");
  return row;
}
