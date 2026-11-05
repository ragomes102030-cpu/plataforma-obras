#!/usr/bin/env node
/**
 * Completa, de forma idempotente, os dados das obras de demonstração.
 * Não altera obras reais: atua apenas nos projetos 7 (AURORA TESTE) e 25
 * (PROJETO ESCOLA ARQUIMEDES), marcados como exemplos no produto.
 */
import fs from "node:fs";
import { Client } from "pg";

const envPath = "C:/Users/Correta Engenharia/Desktop/Novo Documento de Texto.env";
const databaseUrl = process.env.DATABASE_URL ?? fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((line) => line.startsWith("postgresql://"));
if (!databaseUrl) throw new Error("DATABASE_URL não encontrado");

const poolerUrl = new URL(databaseUrl);
poolerUrl.hostname = "aws-0-sa-east-1.pooler.supabase.com";
// Transaction pooler evita que uma sessão de migração abandonada bloqueie o
// backfill das obras de demonstração.
poolerUrl.port = "6543";
poolerUrl.username = "postgres.tromrvfijbtihuilvnuk";
const ca = fs.readFileSync("certs/supabase-ca-2021.crt", "utf8");
const client = new Client({ connectionString: poolerUrl.toString(), ssl: { ca } });

const projetos = [7, 25];
const agora = new Date();

function candidatos(codigo) {
  const partes = String(codigo ?? "").split(".");
  const result = [];
  for (let i = partes.length; i >= 1; i--) result.push(partes.slice(0, i).join("."));
  return result;
}

await client.connect();
try {
  await client.query("begin");
  for (const projectId of projetos) {
    const project = await client.query('select id,"ownerUserId","plannedStart" from projects where id=$1', [projectId]);
    if (!project.rows[0]) continue;
    const budget = await client.query('select id from budget_versions where "projectId"=$1 and status=$2 order by "versionNumber" desc limit 1', [projectId, "aprovado"]);
    if (!budget.rows[0]) throw new Error(`Projeto ${projectId} sem orçamento aprovado`);
    const budgetVersionId = budget.rows[0].id;
    const items = await client.query('select id,code from budget_items where "budgetVersionId"=$1', [budgetVersionId]);
    const byCode = new Map(items.rows.map((row) => [row.code, row.id]));
    const activities = await client.query('select id,"wbsCode","plannedQuantity","is_milestone","startOffset" from schedule_activities where "projectId"=$1 order by id', [projectId]);
    let linked = 0;
    for (const activity of activities.rows) {
      if (activity.is_milestone || activity.plannedQuantity == null || Number(activity.plannedQuantity) <= 0) continue;
      const itemId = candidatos(activity.wbsCode).map((code) => byCode.get(code)).find(Boolean);
      if (!itemId) continue;
      await client.query('update schedule_activities set "budgetItemId"=$1 where id=$2 and "budgetItemId" is null', [itemId, activity.id]);
      linked++;
    }

    const operational = activities.rows.filter((activity) => !activity.is_milestone && Number(activity.plannedQuantity) > 0);
    const weight = operational.length ? 100 / operational.length : 0;
    for (let index = 0; index < operational.length; index++) {
      const value = index === operational.length - 1 ? 100 - weight * (operational.length - 1) : weight;
      await client.query('update schedule_activities set "physicalWeight"=$1,"physicalWeightApprovedAt"=coalesce("physicalWeightApprovedAt",now()) where id=$2', [value.toFixed(6), operational[index].id]);
    }

    // Registros explicitamente didáticos para a demonstração: somente as
    // primeiras atividades já iniciadas, com 10% da quantidade planejada.
    const inicio = new Date(project.rows[0].plannedStart).getTime();
    const elegiveis = operational.filter((a) => inicio + Number(a.startOffset ?? 0) * 86400000 <= agora.getTime()).slice(0, 4);
    for (const activity of elegiveis) {
      const exists = await client.query('select 1 from production_entries where "projectId"=$1 and "activityId"=$2 and status=$3 limit 1', [projectId, activity.id, "confirmada"]);
      if (exists.rowCount) continue;
      await client.query('insert into production_entries ("projectId","activityId","productionDate",quantity,"measurementUnit",notes,status,exemplo,"createdBy") values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [projectId, activity.id, agora.toISOString().slice(0, 10), (Number(activity.plannedQuantity) * 0.1).toFixed(3), "un", "Registro didático de demonstração do MVP; substituir pela medição de campo.", "confirmada", 1, project.rows[0].ownerUserId]);
    }
    console.log(JSON.stringify({ projectId, linked, operational: operational.length, productionSeeded: elegiveis.length }));
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
