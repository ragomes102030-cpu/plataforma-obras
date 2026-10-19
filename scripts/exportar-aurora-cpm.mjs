#!/usr/bin/env node
/**
 * Exporta o cronograma aprovado da AURORA TESTE para o fixture do teste dourado.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/exportar-aurora-cpm.mjs
 *
 * Opcionais: SUPABASE_PROJECT_REF (default do projeto), AURORA_PROJECT_ID (7),
 * AURORA_VERSION_ID (8).
 *
 * O fixture e um contrato: atualizar significa aceitar que o cronograma mudou.
 * Rode o teste depois (`pnpm exec vitest run server/construction/aurora-cpm-golden.test.ts`)
 * e revise o diff antes de commitar.
 */
import { writeFileSync } from "node:fs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Defina SUPABASE_ACCESS_TOKEN (token sbp_...) para exportar.");
  process.exit(1);
}

const ref = process.env.SUPABASE_PROJECT_REF ?? "tromrvfijbtihuilvnuk";
const projectId = Number(process.env.AURORA_PROJECT_ID ?? 7);
const versionId = Number(process.env.AURORA_VERSION_ID ?? 8);

async function consultar(query) {
  const resposta = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!resposta.ok) {
    throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
  }
  return resposta.json();
}

const atividades = await consultar(`
  select id, "durationDays", "earlyStart", "earlyFinish", "lateStart",
         "lateFinish", "totalFloat", "freeFloat", critical
    from schedule_activities
   where "projectId" = ${projectId} and "versionId" = ${versionId}
   order by id;
`);

const dependencias = await consultar(`
  select "predecessorId", "successorId", "type", lag
    from schedule_dependencies
   where "projectId" = ${projectId} and "versionId" = ${versionId}
   order by id;
`);

const fixture = {
  obra: "AURORA TESTE",
  codigo: "OB-PUPOCN",
  projectId,
  versionId,
  capturadoEm: new Date().toISOString().slice(0, 10),
  atividades: atividades.map(a => ({
    id: String(a.id),
    duration: Number(a.durationDays),
    esperado: {
      earlyStart: Number(a.earlyStart),
      earlyFinish: Number(a.earlyFinish),
      lateStart: Number(a.lateStart),
      lateFinish: Number(a.lateFinish),
      totalFloat: Number(a.totalFloat),
      freeFloat: Number(a.freeFloat),
      critical: Boolean(a.critical),
    },
  })),
  dependencias: dependencias.map(d => ({
    predecessorId: String(d.predecessorId),
    successorId: String(d.successorId),
    type: String(d.type),
    lag: Number(d.lag ?? 0),
  })),
};

const destino = new URL("../tests/fixtures/aurora-v3-cpm.json", import.meta.url);
writeFileSync(destino, JSON.stringify(fixture, null, 2) + "\n", "utf8");

console.log(
  `Fixture atualizado: ${fixture.atividades.length} atividades, ` +
    `${fixture.dependencias.length} dependencias -> ${destino.pathname}`
);
