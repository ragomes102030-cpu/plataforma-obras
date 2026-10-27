import pg from "pg";
import { configurarConexaoEap, diagnosticoCertificado } from "./aurora-eap-db-tls.mjs";

const { Client } = pg;
const projectId = Number(process.env.AURORA_PROJECT_ID ?? 7);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada.");
}

const client = new Client(configurarConexaoEap(databaseUrl));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await client.connect();

  const versions = await client.query(
    `
      SELECT id, "versionNumber", status
      FROM project_plan_versions
      WHERE "projectId" = $1
      ORDER BY "versionNumber"
    `,
    [projectId]
  );

  const approved = versions.rows.filter(row => row.status === "approved");
  assert(approved.length === 1, `Aurora deve possuir exatamente 1 versão aprovada; encontrou ${approved.length}.`);

  const latestApproved = approved[0];
  const versionId = latestApproved.id;

  const nodes = await client.query(
    `
      SELECT id, "parentId", code, name, level, "nodeType",
             description, inclusions, exclusions, "acceptanceCriteria"
      FROM wbs_nodes
      WHERE "versionId" = $1
      ORDER BY "sortOrder", id
    `,
    [versionId]
  );

  const rows = nodes.rows;
  const byId = new Map(rows.map(node => [String(node.id), node]));
  const children = new Map();

  for (const node of rows) {
    const key = node.parentId == null ? "root" : String(node.parentId);
    children.set(key, [...(children.get(key) ?? []), node]);
  }

  const leaves = rows.filter(node => !children.has(String(node.id)));
  const roots = rows.filter(node => node.parentId == null);
  const orphans = rows.filter(
    node => node.parentId != null && !byId.has(String(node.parentId))
  );
  const nonLeavesWithoutChildren = rows.filter(
    node => node.nodeType !== "pacote" && !children.has(String(node.id))
  );
  const duplicates = rows.filter((node, index) =>
    rows.some(
      (other, otherIndex) =>
        otherIndex < index &&
        other.parentId === node.parentId &&
        String(other.name).trim().toLowerCase() === String(node.name).trim().toLowerCase()
    )
  );
  const leafChildren = rows.filter(
    node => node.nodeType === "pacote" && children.has(String(node.id))
  );
  const invalidLevels = rows.filter(node => {
    if (node.parentId == null) return Number(node.level) !== 1;
    const parent = byId.get(String(node.parentId));
    return !parent || Number(node.level) !== Number(parent.level) + 1;
  });

  // Integridade, não fotografia fixa: a EAP pode evoluir legitimamente.
  assert(rows.length > 0, "A EAP aprovada não pode estar vazia.");
  assert(leaves.length > 0, "A EAP aprovada precisa de pacotes terminais.");
  assert(roots.length === 1, `Esperada 1 raiz; encontrado ${roots.length}.`);
  const duplicateCodes = rows.filter((node, index) =>
    rows.some((other, otherIndex) =>
      otherIndex < index && other.code === node.code
    )
  );
  assert(duplicateCodes.length === 0, `Existem ${duplicateCodes.length} códigos da EAP duplicados.`);
  // Fotografias opcionais são verificadas SOMENTE quando explicitamente solicitadas.
  // Ex.: AURORA_EAP_SNAPSHOT=69:53:15 para uma regressão congelada específica.
  const snapshot = process.env.AURORA_EAP_SNAPSHOT?.trim();
  if (snapshot) {
    assert(/^\d+:\d+:\d+$/.test(snapshot), "AURORA_EAP_SNAPSHOT deve usar nós:folhas:etapas.");
    const [nodesExpected, leavesExpected, phasesExpected] = snapshot.split(":").map(Number);
    assert(rows.length === nodesExpected, `Snapshot: esperado ${nodesExpected} nós; encontrado ${rows.length}.`);
    assert(leaves.length === leavesExpected, `Snapshot: esperado ${leavesExpected} folhas; encontrado ${leaves.length}.`);
    assert(rows.filter(node => Number(node.level) === 2).length === phasesExpected,
      `Snapshot: esperado ${phasesExpected} grupos nível 2.`);
  }
  assert(orphans.length === 0, `Existem ${orphans.length} nós órfãos.`);
  assert(
    nonLeavesWithoutChildren.length === 0,
    `Existem ${nonLeavesWithoutChildren.length} nós não-pacote sem filhos.`
  );
  assert(duplicates.length === 0, `Existem ${duplicates.length} nomes duplicados entre irmãos.`);
  assert(leafChildren.length === 0, `Existem ${leafChildren.length} pacotes com filhos.`);
  assert(invalidLevels.length === 0, `Existem ${invalidLevels.length} nós com nível hierárquico inválido.`);

  for (const leaf of leaves) {
    assert(leaf.nodeType === "pacote",
      `Folha ${leaf.code} deve ser pacote terminal.`);
    for (const field of ["description", "inclusions", "exclusions", "acceptanceCriteria"]) {
      assert(
        String(leaf[field] ?? "").trim().length > 0,
        `Folha ${leaf.code} sem ${field}.`
      );
    }
  }

  // Uma EAP pode decompor um pacote em mais de uma atividade. A integridade
  // vem do vínculo com um nó da MESMA versão, não da contagem de folhas.
  const activities = await client.query(
    `
      SELECT a."versionId"::int AS version_id,
             count(*)::int AS total,
             count(*) FILTER (WHERE a."durationDays" IS NULL OR a."durationDays" <= 0)::int AS invalid_duration,
             count(*) FILTER (WHERE a."wbsNodeId" IS NULL OR n.id IS NULL)::int AS unlinked,
             count(*) FILTER (WHERE n.id IS NOT NULL AND n."versionId" IS DISTINCT FROM a."versionId")::int AS wrong_version
      FROM schedule_activities a
      LEFT JOIN wbs_nodes n ON n.id = a."wbsNodeId"
      WHERE a."projectId" = $1
      GROUP BY a."versionId"
      ORDER BY a."versionId"
    `,
    [projectId]
  );

  for (const row of activities.rows) {
    assert(
      Number(row.invalid_duration) === 0,
      `Versão ${row.version_id} tem ${row.invalid_duration} atividades sem duração positiva.`
    );
    assert(
      Number(row.unlinked) === 0 && Number(row.wrong_version) === 0,
      `Versão ${row.version_id} possui ${row.unlinked} atividades sem EAP e ${row.wrong_version} ligadas a versões diferentes.`
    );
  }

  // Dependência não pode ligar uma atividade a ela mesma nem atravessar versões.
  const dependencies = await client.query(
    `
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE d."predecessorId" = d."successorId")::int AS self_loop,
             count(*) FILTER (WHERE p."versionId" IS DISTINCT FROM s."versionId" OR d."versionId" IS DISTINCT FROM p."versionId")::int AS cross_version
      FROM schedule_dependencies d
      JOIN schedule_activities p ON p.id = d."predecessorId"
      JOIN schedule_activities s ON s.id = d."successorId"
      WHERE d."projectId" = $1
    `,
    [projectId]
  );

  assert(
    Number(dependencies.rows[0].self_loop) === 0,
    `Existem ${dependencies.rows[0].self_loop} dependências de uma atividade com ela mesma.`
  );
  assert(
    Number(dependencies.rows[0].cross_version) === 0,
    `Existem ${dependencies.rows[0].cross_version} dependências ligando versões diferentes da EAP.`
  );

  console.log(JSON.stringify({
    passed: true,
    projectId,
    approvedVersionId: versionId,
    approvedVersionNumber: latestApproved.versionNumber,
    nodes: rows.length,
    leaves: leaves.length,
    level2: rows.filter(node => Number(node.level) === 2).length,
    roots: roots.length,
    orphans: orphans.length,
    invalidLevels: invalidLevels.length,
    structuralBlockers: 0,
    derivedActivities: Number(activities.rows.reduce((sum, row) => sum + Number(row.total), 0)),
    derivedDependencies: Number(dependencies.rows[0].total),
    versionsWithSchedule: activities.rows.map(row => Number(row.version_id)),
  }, null, 2));
}

main()
  .catch(error => {
    console.error(diagnosticoCertificado(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
