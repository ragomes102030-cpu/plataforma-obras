import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "../drizzle/schema";

/**
 * O CONTRATO DO SCHEMA — a superfície que o resto do programa consome.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * Doze arquivos importam `drizzle/schema`: `server/routers.ts`, `server/db.ts`,
 * `server/llm-settings.ts`, `server/agent-execution.ts`,
 * `server/construction/plan-versions.ts`, `server/construction/eap-seeder.ts`,
 * `server/construction/calendario-obra.ts`,
 * `server/construction/local-database-source.ts`, `server/_core/sdk.ts`,
 * `server/_core/context.ts` e a auditoria de schema. Todos eles dependem de duas
 * coisas: que o nome do export continue existindo, e que a coluna continue tendo
 * o mesmo nome.
 *
 * A porta do MySQL para o PostgreSQL troca `mysqlTable` por `pgTable`,
 * `mysqlEnum` por `pgEnum` e `int` por `integer`. Nada disso é gratuito: uma
 * coluna renomeada quebra a consulta que a usava em outro arquivo, e o erro
 * aparece em runtime, longe da linha que o causou. Este teste é o que faz a
 * porta ser verificada em vez de ser achada.
 *
 * POR QUE ELE SOBREVIVE À TROCA DE DIALETO
 *
 * `getTableName` e `getTableColumns` são exportados pela raiz de `drizzle-orm`,
 * e não por `mysql-core` nem por `pg-core`. O teste não importa o dialeto, então
 * roda igual antes e depois da porta. `getTableConfig`, que também existe, é
 * específico de cada dialeto e por isso não é usado aqui.
 *
 * O literal abaixo não foi escrito à mão: foi extraído do schema, e é por isso
 * que vale como contrato e não como opinião.
 */

/** Tabela → colunas, em ordem alfabética. Extraído do schema, não digitado. */
const CONTRATO: Record<string, string[]> = {
  activity_resource_allocations: ["activityId", "createdAt", "id", "productivity", "quantity", "resourceId"],
  agent_decisions: ["createdAt", "decision", "id", "impactJson", "projectId", "reason", "scopeJson", "stage", "userId"],
  agent_findings: ["classification", "confidence", "createdAt", "description", "entityRef", "entityType", "id", "impact", "originalValueJson", "projectId", "proposedValueJson", "resolutionNote", "resolvedAt", "resolvedBy", "sourceJson", "stage", "status", "updatedAt"],
  agent_memories: ["approvedAt", "approvedBy", "category", "confidence", "createdAt", "id", "memoryKey", "ownerUserId", "projectId", "scope", "sourceRef", "sourceType", "status", "updatedAt", "valueJson"],
  agent_project_states: ["activeSection", "activeSubtab", "blockerCount", "createdAt", "id", "lastSummary", "projectId", "stage", "updatedAt", "version"],
  agent_run_events: ["createdAt", "eventJson", "eventType", "id", "projectId", "requestId", "userId"],
  agent_runs: ["contextJson", "createdAt", "currentStep", "errorCode", "errorMessage", "finishedAt", "id", "iterations", "model", "projectId", "provider", "requestId", "resultJson", "startedAt", "status", "updatedAt", "userId"],
  budget_items: ["budgetVersionId", "code", "compositionId", "compositionNote", "compositionUnitCost", "createdAt", "description", "id", "isPriceException", "plannedDurationDays", "productivity", "quantity", "referencePeriod", "sortOrder", "source", "unit", "unitPrice", "updatedAt", "wbsNodeId"],
  budget_versions: ["createdAt", "createdBy", "currency", "id", "name", "notes", "projectId", "status", "updatedAt", "versionNumber"],
  calendar_exceptions: ["calendarId", "createdAt", "date", "id", "name", "type"],
  composition_components: ["coefficient", "componentType", "compositionId", "createdAt", "id", "priceItemId", "unitPriceSnapshot"],
  llm_provider_settings: ["createdAt", "encryptedConfig", "id", "updatedAt", "updatedBy"],
  mcp_homologation_runs: ["createdAt", "error", "finishedAt", "id", "planJson", "projectId", "readOnlyResultJson", "reconciliationJson", "requestId", "startedAt", "status", "updatedAt", "userId"],
  mcp_mutation_operations: ["argsJson", "confirmationToken", "confirmedAt", "createdAt", "error", "executedAt", "externalProjectId", "id", "idempotencyKey", "projectId", "provider", "resultJson", "status", "toolName", "updatedAt", "userId"],
  planning_resources: ["active", "capacityPerDay", "costPerDay", "createdAt", "id", "name", "projectId", "resourceType", "unit", "updatedAt"],
  price_catalogs: ["createdAt", "createdBy", "id", "name", "notes", "referencePeriod", "sourceType", "state", "status", "updatedAt"],
  price_items: ["catalogId", "code", "createdAt", "description", "id", "itemType", "notes", "unit", "unitPrice", "updatedAt"],
  production_entries: ["activityId", "createdAt", "createdBy", "exemplo", "frontId", "id", "measurementUnit", "notes", "productionDate", "projectId", "quantity", "status", "teamId", "unitId", "updatedAt"],
  production_fronts: ["code", "createdAt", "id", "location", "name", "projectId", "status", "updatedAt"],
  production_teams: ["active", "createdAt", "id", "memberCount", "name", "projectId", "trade", "updatedAt"],
  production_units: ["code", "createdAt", "id", "name", "projectId", "sortOrder", "unitType"],
  project_audit_events: ["action", "createdAt", "id", "payload", "projectId", "userId"],
  project_mcp_integrations: ["createdAt", "endpointUrl", "externalProjectId", "id", "lastError", "lastSyncedAt", "projectId", "provider", "syncState", "updatedAt"],
  project_plan_versions: ["approvedAt", "baseVersionId", "createdAt", "createdBy", "decisionId", "id", "notes", "projectId", "status", "updatedAt", "versionNumber"],
  projects: ["baseReferencia", "baseReferenciaRef", "code", "createdAt", "descricao", "id", "location", "name", "ownerUserId", "plannedFinish", "plannedStart", "progress", "status", "updatedAt"],
  schedule_activities: ["budgetItemId", "cpmCalculatedAt", "createdAt", "critical", "durationDays", "eapRef", "earlyFinish", "earlyStart", "exemplo", "externalId", "finishNoLaterThan", "freeFloat", "id", "lateFinish", "lateStart", "mustStartOn", "name", "pavimento", "phase", "plannedQuantity", "productivity", "progress", "projectId", "sortOrder", "startOffset", "status", "totalFloat", "unit", "updatedAt", "versionId", "wbsCode", "wbsNodeId"],
  schedule_baseline_items: ["activityId", "baselineId", "durationDays", "earlyFinish", "earlyStart", "id", "startOffset"],
  schedule_baselines: ["createdAt", "createdBy", "id", "name", "projectId", "status"],
  schedule_dependencies: ["createdAt", "externalId", "id", "lag", "predecessorId", "projectId", "successorId", "type", "versionId"],
  service_compositions: ["code", "createdAt", "createdBy", "description", "id", "referencePeriod", "sourceCatalogId", "status", "unit", "updatedAt"],
  users: ["createdAt", "email", "id", "lastSignedIn", "loginMethod", "name", "openId", "role", "updatedAt"],
  wbs_nodes: ["code", "createdAt", "externalId", "externalUid", "id", "level", "name", "nodeType", "parentId", "plannedQuantity", "projectId", "sortOrder", "unit", "updatedAt", "versionId"],
  work_calendars: ["createdAt", "id", "name", "projectId", "updatedAt", "weekPattern"],
};

/**
 * Extrai a superfície do schema: tabela → colunas, ambas ordenadas.
 *
 * `getTableName` devolve string para uma tabela e lança para qualquer outra
 * coisa. O `try/catch` é o filtro: `schema` exporta também tipos e funções, e
 * só as tabelas passam. Não há lista de nomes escrita à mão aqui — se a porta
 * renomear um export, esta função vê a tabela nova com o nome novo, e a
 * comparação abaixo acusa.
 */
function superficie(): Record<string, string[]> {
  const saida: Record<string, string[]> = {};
  for (const valor of Object.values(schema)) {
    let nome: string;
    try {
      nome = getTableName(valor as never);
    } catch {
      continue;
    }
    if (typeof nome !== "string" || nome.length === 0) continue;
    saida[nome] = Object.values(getTableColumns(valor as never))
      .map(c => c.name)
      .filter((n): n is string => typeof n === "string")
      .sort();
  }
  return saida;
}

describe("contrato do schema", () => {
  it("tem as 33 tabelas do contrato", () => {
    const nomes = Object.keys(superficie()).sort();
    expect(nomes).toEqual(Object.keys(CONTRATO).sort());
  });

  it("cada tabela tem exatamente as colunas do contrato", () => {
    const atual = superficie();
    const problemas: string[] = [];

    for (const [tabela, esperadas] of Object.entries(CONTRATO)) {
      const obtidas = atual[tabela];
      if (!obtidas) {
        problemas.push(`${tabela}: tabela ausente do schema`);
        continue;
      }
      const faltando = esperadas.filter(c => !obtidas.includes(c));
      const sobrando = obtidas.filter(c => !esperadas.includes(c));
      if (faltando.length > 0) {
        problemas.push(`${tabela}: faltam colunas -> ${faltando.join(", ")}`);
      }
      if (sobrando.length > 0) {
        problemas.push(`${tabela}: colunas novas -> ${sobrando.join(", ")}`);
      }
    }

    expect(problemas).toEqual([]);
  });

  it("o total de colunas continua 361", () => {
    // Contagem bruta proposital: pega coluna duplicada dentro de uma tabela, que
    // a comparação de conjuntos acima deixaria passar.
    const total = Object.values(superficie()).reduce((s, c) => s + c.length, 0);
    expect(total).toBe(361);
  });
});
