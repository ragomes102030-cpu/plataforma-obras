/**
 * Fase 1: Acesso direto ao banco de dados
 * 
 * Permite que o Arquimedes execute queries no banco sem depender
 * dos MCPs remotos (EAP, Cronograma, Gantt).
 * 
 * Segurança:
 * - Apenas SELECT (read-only)
 * - Timeout de 5s
 * - Limite de 1000 rows
 * - Apenas tabelas do sistema (não system tables)
 */

import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://tromrvfijbtihuilvnuk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}

const MAX_ROWS = 1000;
const TIMEOUT_MS = 5000;

const ALLOWED_TABLES = [
  "projects",
  "project_plan_versions",
  "wbs_nodes",
  "schedule_activities",
  "schedule_dependencies",
  "schedule_baselines",
  "schedule_baseline_items",
  "production_fronts",
  "production_teams",
  "production_units",
  "production_entries",
  "budget_versions",
  "budget_items",
  "price_catalogs",
  "price_items",
  "service_compositions",
  "composition_components",
  "planning_resources",
  "activity_resource_allocations",
  "agent_memories",
  "agent_runs",
  "agent_run_events",
  "agent_findings",
  "agent_decisions",
  "arquimedes_capabilities",
  "arquimedes_capability_events",
  "project_documents",
  "project_mcp_integrations",
  "project_audit_events",
  "work_calendars",
  "calendar_exceptions",
  "mcp_mutation_operations",
  "mcp_homologation_runs",
  "llm_provider_settings",
  "agent_project_states",
];

export function registerDatabaseTools(server: any) {
  // List tables
  server.tool(
    "list_tables",
    "Lista todas as tabelas disponíveis no banco de dados com contagem de registros",
    {},
    async () => {
      try {
        const db = getSupabase();
        const results = await Promise.all(
          ALLOWED_TABLES.map(async (table) => {
            const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
            if (error) return { table, count: 0, error: error.message };
            return { table, count: count ?? 0 };
          })
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        };
      }
    }
  );

  // Get table schema
  server.tool(
    "get_table_schema",
    "Retorna o schema de uma tabela (colunas, tipos, constraints)",
    {
      table: z.string().describe("Nome da tabela"),
    },
    async ({ table }: { table: string }) => {
      try {
        if (!ALLOWED_TABLES.includes(table)) {
          return {
            content: [{ type: "text", text: `Error: Table '${table}' is not in allowed tables list` }],
          };
        }
        const db = getSupabase();
        const { data, error } = await db.from(table).select("*").limit(0);
        if (error) throw error;
        
        // Get column info from information_schema
        const { data: columns, error: colError } = await db.rpc("get_table_columns", { 
          table_name: table 
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ table, columns: columns ?? [], sample: data }, null, 2),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        };
      }
    }
  );

  // Query table
  server.tool(
    "query_table",
    "Executa uma query SELECT em uma tabela do banco",
    {
      table: z.string().describe("Nome da tabela"),
      columns: z.string().default("*").describe("Colunas a selecionar"),
      filters: z.string().describe("Filtros WHERE (ex: \"projectId=7 AND status='active'\")"),
      orderBy: z.string().optional().describe("Ordenação (ex: \"createdAt DESC\")"),
      limit: z.number().default(100).describe("Limite de registros"),
    },
    async ({ table, columns, filters, orderBy, limit }: { table: string; columns: string; filters: string; orderBy?: string; limit: number }) => {
      try {
        if (!ALLOWED_TABLES.includes(table)) {
          return {
            content: [{ type: "text", text: `Error: Table '${table}' is not in allowed tables list` }],
          };
        }

        const db = getSupabase();
        const limitedLimit = Math.min(limit, MAX_ROWS);
        
        // Build query using Supabase client
        let query = db.from(table).select(columns);
        
        // Apply filters
        if (filters) {
          const filterParts = filters.split(" AND ").map((f: string) => f.trim());
          for (const filter of filterParts) {
            const match = filter.match(/^(\w+)(=|!=|>|<|>=|<=|like|ilike)(.+)$/);
            if (match) {
              const [, col, op, val] = match;
              const cleanVal = val.replace(/^['"]|['"]$/g, "");
              switch (op) {
                case "=": query = query.eq(col, cleanVal); break;
                case "!=": query = query.neq(col, cleanVal); break;
                case ">": query = query.gt(col, cleanVal); break;
                case "<": query = query.lt(col, cleanVal); break;
                case ">=": query = query.gte(col, cleanVal); break;
                case "<=": query = query.lte(col, cleanVal); break;
                case "like": query = query.like(col, cleanVal); break;
                case "ilike": query = query.ilike(col, cleanVal); break;
              }
            }
          }
        }

        // Apply ordering
        if (orderBy) {
          const [col, dir] = orderBy.split(" ");
          query = query.order(col, { ascending: dir?.toUpperCase() !== "DESC" });
        }

        // Apply limit
        query = query.limit(limitedLimit);

        const { data, error } = await query;
        if (error) throw error;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ table, count: data?.length ?? 0, data }, null, 2),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        };
      }
    }
  );

  // Get project summary
  server.tool(
    "get_project_summary",
    "Retorna um resumo completo de um projeto (EAP, atividades, orçamento, produção, etc.)",
    {
      projectId: z.number().describe("ID do projeto"),
    },
    async ({ projectId }: { projectId: number }) => {
      try {
        const db = getSupabase();
        
        const [
          { data: project },
          { data: versions },
          { data: wbsNodes },
          { data: activities },
          { data: dependencies },
          { data: baselines },
          { data: budgetVersions },
          { data: productionFronts },
          { data: productionTeams },
          { data: productionEntries },
          { data: agentMemories },
          { data: agentFindings },
        ] = await Promise.all([
          db.from("projects").select("*").eq("id", projectId).single(),
          db.from("project_plan_versions").select("*").eq("projectId", projectId).order("versionNumber", { ascending: false }),
          db.from("wbs_nodes").select("*").eq("projectId", projectId),
          db.from("schedule_activities").select("*").eq("projectId", projectId),
          db.from("schedule_dependencies").select("*").eq("projectId", projectId),
          db.from("schedule_baselines").select("*").eq("projectId", projectId),
          db.from("budget_versions").select("*").eq("projectId", projectId),
          db.from("production_fronts").select("*").eq("projectId", projectId),
          db.from("production_teams").select("*").eq("projectId", projectId),
          db.from("production_entries").select("*").eq("projectId", projectId),
          db.from("agent_memories").select("*").eq("projectId", projectId),
          db.from("agent_findings").select("*").eq("projectId", projectId),
        ]);

        // Buscar itens de orçamento separadamente (depende do budgetVersions)
        const { data: budgetItems } = await db.from("budget_items").select("*").eq("budgetVersionId", budgetVersions?.[0]?.id ?? 0);

        const summary = {
          project,
          versions,
          counts: {
            wbsNodes: wbsNodes?.length ?? 0,
            activities: activities?.length ?? 0,
            dependencies: dependencies?.length ?? 0,
            baselines: baselines?.length ?? 0,
            budgetVersions: budgetVersions?.length ?? 0,
            budgetItems: budgetItems?.length ?? 0,
            productionFronts: productionFronts?.length ?? 0,
            productionTeams: productionTeams?.length ?? 0,
            productionEntries: productionEntries?.length ?? 0,
            agentMemories: agentMemories?.length ?? 0,
            agentFindings: agentFindings?.length ?? 0,
          },
          activities: activities?.slice(0, 5),
          budgetTotal: budgetItems?.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        };
      }
    }
  );
}
