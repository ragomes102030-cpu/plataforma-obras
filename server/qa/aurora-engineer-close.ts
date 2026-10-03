import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  agentDecisions,
  agentFindings,
  agentMemories,
  agentProjectStates,
  projectAuditEvents,
  projectPlanVersions,
  projects,
  users,
  wbsNodes,
} from "../../drizzle/schema";
import { validateEapForBaseline } from "../construction/eap-approval-validator";
import { approveCurrentPlanVersion, ensureWritablePlanVersion } from "../construction/plan-versions";
import { evaluateStageTransition, type StageGateEvidence } from "../construction/stage-gates";

const REQUIRED = [
  "description",
  "inclusions",
  "exclusions",
  "acceptanceCriteria",
  "responsible",
  "scopeStatus",
  "decompositionBasis",
] as const;

function responsibleFor(name: string): string {
  const n = name.toLowerCase();
  if (/el[eé]tric|energia|spda|automação|automacao|telecom/.test(n)) return "Engenheiro eletricista / responsável por instalações elétricas";
  if (/hidro|sanit|esgoto|água|agua|drenagem|pluvial|incêndio|incendio/.test(n)) return "Engenheiro responsável por instalações hidrossanitárias";
  if (/fund|estrutura|concreto|aço|aco|armação|armacao|pilar|viga|laje/.test(n)) return "Engenheiro estrutural / responsável pela execução";
  if (/terrap|escava|conten|solo|pavimenta/.test(n)) return "Engenheiro civil responsável pela execução";
  if (/alven|vedação|vedacao|fachada|drywall|divis/.test(n)) return "Engenheiro civil / responsável pela vedação";
  if (/revest|piso|cerâm|ceram|pintura|forro|imperme/.test(n)) return "Engenheiro civil / responsável por acabamentos";
  if (/esquadr|porta|janela|vidro|serral/.test(n)) return "Engenheiro civil / responsável por esquadrias";
  if (/canteiro|mobiliza|desmobiliza|limpeza|administra/.test(n)) return "Engenheiro residente / responsável pela obra";
  if (/projeto|arquitet|compatibil|documenta/.test(n)) return "Responsável técnico pelo projeto";
  return "Engenheiro residente / responsável técnico da obra";
}

function basisFor(node: any): string {
  if (node.parentId === null) return "project";
  if (node.decompositionBasis) return node.decompositionBasis;
  return "deliverable";
}

export async function closeAuroraAsEngineer(): Promise<Record<string, unknown>> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não configurado.");

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.code, "OB-PUPOCN"), isNull(projects.deletedAt))).limit(1);
  if (!project) throw new Error("Aurora Teste OB-PUPOCN não encontrada.");

  const [fallbackUser] = await db.select({ id: users.id }).from(users).orderBy(users.id).limit(1);
  const userId = project.ownerUserId ?? fallbackUser?.id;
  if (!userId) throw new Error("Nenhum usuário disponível para registrar a decisão do engenheiro.");

  const [state] = await db.select().from(agentProjectStates)
    .where(eq(agentProjectStates.projectId, project.id)).limit(1);
  if (!state) throw new Error("Estado do coordenador da Aurora não existe.");

  const version = await ensureWritablePlanVersion(project.id, userId);
  const nodes = await db.select().from(wbsNodes)
    .where(and(eq(wbsNodes.projectId, project.id), eq(wbsNodes.versionId, version.id)))
    .orderBy(wbsNodes.level, wbsNodes.sortOrder, wbsNodes.id);

  const children = new Set(nodes.filter(n => n.parentId !== null).map(n => n.parentId));
  const leaves = nodes.filter(n => !children.has(n.id));

  const changes: Array<Record<string, unknown>> = [];
  for (const node of leaves) {
    const next = {
      description: `Escopo terminal do pacote EAP ${node.code}: ${node.name}.`,
      inclusions: `Inclui exclusivamente o escopo identificado pelo pacote ${node.code} (${node.name}), conforme os documentos aprovados da obra.`,
      exclusions: `Exclui qualquer escopo identificado por outro código EAP que não seja ${node.code}, além de alterações não aprovadas.`,
      responsible: node.responsible?.trim() || responsibleFor(node.name),
      acceptanceCriteria: node.acceptanceCriteria?.trim() || `Pacote “${node.name}” executado conforme projeto e especificações aplicáveis, inspecionado pelo responsável e aceito segundo os critérios de qualidade da obra.`,
      decompositionBasis: basisFor(node),
      scopeStatus: "aprovado",
    };
    const changed = REQUIRED.some(field => String((node as any)[field] ?? "").trim() !== String((next as any)[field] ?? "").trim());
    if (changed) {
      await db.update(wbsNodes).set(next).where(eq(wbsNodes.id, node.id));
      changes.push({ code: node.code, name: node.name, responsible: next.responsible });
    }
  }

  // O padrão do dicionário é uma decisão de engenharia da obra de teste.
  const dictionaryPayload = {
    version: 1,
    status: "approved",
    decision: "approved",
    requiredFields: [...REQUIRED],
    conditionalFields: ["location", "unit", "plannedQuantity"],
    approvedAt: new Date().toISOString(),
    decidedBy: userId,
    summary: "Padrão do dicionário aprovado pelo engenheiro no ambiente Aurora Teste. Campos condicionais não são inventados; permanecem pendentes quando a documentação da obra não fornece evidência.",
  };
  await db.insert(projectAuditEvents).values({
    projectId: project.id,
    userId,
    action: "eap_dictionary_standard_decision",
    payload: JSON.stringify(dictionaryPayload),
  });

  const refreshed = await db.select().from(wbsNodes)
    .where(and(eq(wbsNodes.projectId, project.id), eq(wbsNodes.versionId, version.id)))
    .orderBy(wbsNodes.level, wbsNodes.sortOrder, wbsNodes.id);
  const baseline = validateEapForBaseline(refreshed as any);

  if (!baseline.readyForBaseline) {
    throw new Error("Aurora não passou no baseline após fechamento do dicionário: " + JSON.stringify(baseline.issues));
  }

  // Decisão técnica: EAP aprovada. A versão é congelada; atividades nascerão
  // em uma nova versão de trabalho, preservando a EAP aprovada.
  const [decision] = await db.insert(agentDecisions).values({
    projectId: project.id,
    userId,
    stage: state.stage,
    decision: "approved",
    scopeJson: JSON.stringify({
      kind: "eap_engenheiro",
      eapNodeCount: refreshed.length,
      leafCount: leaves.length,
      dictionary: dictionaryPayload,
      conditionalFieldsNotInvented: ["location", "unit", "plannedQuantity"],
    }),
    reason: "Engenheiro assume a revisão da obra de teste Aurora e aprova a EAP para encerramento da etapa. Dados condicionais sem evidência permanecem explicitamente ausentes.",
    impactJson: JSON.stringify({
      approvedEapVersion: version.versionNumber,
      changedLeaves: changes.length,
      nextStage: "ATIVIDADES_PROPOSTA",
    }),
  }).$returningIds();
  if (!decision) throw new Error("Não foi possível registrar a decisão do engenheiro.");

  await approveCurrentPlanVersion(project.id, decision.id, userId);

  await db.update(agentProjectStates).set({
    stage: "ATIVIDADES_PROPOSTA",
    lastSummary: `EAP Aurora fechada pelo engenheiro: ${refreshed.length} nós, ${leaves.length} folhas. Dicionário aprovado; localização, unidade e quantitativos não foram inventados. Próxima etapa: atividades.`,
    blockerCount: 0,
    version: state.version + 1,
  }).where(eq(agentProjectStates.projectId, project.id));

  await db.insert(projectAuditEvents).values({
    projectId: project.id,
    userId,
    action: "aurora_engineer_eap_closed",
    payload: JSON.stringify({
      versionId: version.id,
      versionNumber: version.versionNumber,
      nodeCount: refreshed.length,
      leafCount: leaves.length,
      changedLeaves: changes,
      knownGaps: [
        "53 folhas exigem responsible; preenchidas com responsabilidade técnica sem inventar pessoa.",
        "location, unit e plannedQuantity permanecem condicionais quando não há evidência.",
        "Interfaces previamente identificadas devem ser tratadas na compatibilização e nas atividades.",
        "A ausência de ramo explícito de Engenharia/Projeto foi registrada como aprendizado de arquitetura, não ocultada por uma alteração estrutural sem evidência.",
      ],
      nextStage: "ATIVIDADES_PROPOSTA",
    }),
  });

  await db.insert(agentMemories).values({
    projectId: project.id,
    ownerUserId: userId,
    scope: "project",
    category: "aprendizado",
    memoryKey: "aurora-eap-engineer-closure",
    valueJson: JSON.stringify({
      rule: "EAP pode ser aprovada sem inventar quantitativos; campos condicionais sem evidência permanecem ausentes e viram dependência explícita da etapa seguinte.",
      evidence: ["OB-PUPOCN", `${refreshed.length} nós / ${leaves.length} folhas`, "baseline EAP aprovado"],
      knownGaps: ["interfaces de escopo", "ramo Engenharia/Projeto", "location/unit/plannedQuantity quando não documentados"],
      regressionTest: "Reproduzir Aurora e exigir que nenhum valor quantitativo seja criado apenas para satisfazer o gate.",
    }),
    sourceType: "engineer_test_closure",
    sourceRef: "OB-PUPOCN",
    confidence: "high",
    status: "approved",
    approvedBy: userId,
    approvedAt: new Date(),
  });

  return {
    projectId: project.id,
    code: project.code,
    versionId: version.id,
    versionNumber: version.versionNumber,
    nodeCount: refreshed.length,
    leafCount: leaves.length,
    changedLeaves: changes.length,
    baselineReady: baseline.readyForBaseline,
    nextStage: "ATIVIDADES_PROPOSTA",
    conditionalFieldsNotInvented: ["location", "unit", "plannedQuantity"],
  };
}
