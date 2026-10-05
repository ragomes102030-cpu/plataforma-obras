import pg from "pg";

const { Client } = pg;
const projectId = Number(process.env.AURORA_PROJECT_ID ?? 7);
const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("SUPABASE_DB_URL ou DATABASE_URL não configurada.");
}

const client = new Client({ connectionString: databaseUrl });

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

  assert(rows.length === 69, `Esperado 69 nós; encontrado ${rows.length}.`);
  assert(leaves.length === 53, `Esperado 53 folhas; encontrado ${leaves.length}.`);
  assert(roots.length === 1, `Esperada 1 raiz; encontrado ${roots.length}.`);
  assert(
    rows.filter(node => node.level === 2).length === 15,
    "Esperados 15 grupos de nível 2."
  );
  assert(orphans.length === 0, `Existem ${orphans.length} nós órfãos.`);
  assert(
    nonLeavesWithoutChildren.length === 0,
    `Existem ${nonLeavesWithoutChildren.length} nós não-pacote sem filhos.`
  );
  assert(duplicates.length === 0, `Existem ${duplicates.length} nomes duplicados entre irmãos.`);
  assert(leafChildren.length === 0, `Existem ${leafChildren.length} pacotes com filhos.`);
  assert(invalidLevels.length === 0, `Existem ${invalidLevels.length} nós com nível hierárquico inválido.`);

  for (const leaf of leaves) {
    for (const field of ["description", "inclusions", "exclusions", "acceptanceCriteria"]) {
      assert(
        String(leaf[field] ?? "").trim().length > 0,
        `Folha ${leaf.code} sem ${field}.`
      );
    }
  }

  const activities = await client.query(
    `
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE "durationDays" IS NULL OR "durationDays" <= 0)::int AS invalid_duration
      FROM schedule_activities
      WHERE "projectId" = $1
    `,
    [projectId]
  );

  assert(
    Number(activities.rows[0].total) === 0,
    `Aurora não deve possuir atividades antes da etapa formal de derivação; encontrou ${activities.rows[0].total}.`
  );

  const dependencies = await client.query(
    `
      SELECT count(*)::int AS total
      FROM schedule_dependencies
      WHERE "projectId" = $1
    `,
    [projectId]
  );

  assert(
    Number(dependencies.rows[0].total) === 0,
    `Aurora não deve possuir dependências antes da etapa formal de derivação; encontrou ${dependencies.rows[0].total}.`
  );

  console.log(JSON.stringify({
    passed: true,
    projectId,
    approvedVersionId: versionId,
    approvedVersionNumber: latestApproved.versionNumber,
    nodes: rows.length,
    leaves: leaves.length,
    level2: 15,
    roots: roots.length,
    orphans: orphans.length,
    invalidLevels: invalidLevels.length,
    structuralBlockers: 0,
    activitiesBeforeScheduling: Number(activities.rows[0].total),
    dependenciesBeforeScheduling: Number(dependencies.rows[0].total),
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
