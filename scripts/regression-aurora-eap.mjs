import pg from "pg";

const { Client } = pg;
const projectId = Number(process.env.AURORA_PROJECT_ID ?? 7);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada.");
}

const connectionUrl = new URL(databaseUrl);
const sslMode = (connectionUrl.searchParams.get("ssl-mode") ?? connectionUrl.searchParams.get("sslmode") ?? "").toLowerCase();
if (sslMode === "disable" || sslMode === "disabled") {
  throw new Error("DATABASE_URL não pode desabilitar TLS.");
}
connectionUrl.searchParams.delete("ssl-mode");
connectionUrl.searchParams.delete("sslmode");
const client = new Client({ connectionString: connectionUrl.toString(), ssl: { rejectUnauthorized: true } });

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

  // A derivação do cronograma já aconteceu na Aurora: a versão aprovada (v3) e o
  // fork da v4 têm atividade para cada folha. Proibir atividade, como antes,
  // passou a contrariar o próprio produto. O que se guarda agora é a coerência
  // da derivação: uma atividade por folha da EAP daquela versão, com duração
  // positiva.
  const activities = await client.query(
    `
      SELECT a."versionId"::int AS version_id,
             count(*)::int AS total,
             count(*) FILTER (WHERE a."durationDays" IS NULL OR a."durationDays" <= 0)::int AS invalid_duration,
             (
               SELECT count(*)::int
               FROM wbs_nodes n
               WHERE n."versionId" = a."versionId"
                 AND NOT EXISTS (SELECT 1 FROM wbs_nodes f WHERE f."parentId" = n.id)
             ) AS leaves_of_version
      FROM schedule_activities a
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
      Number(row.total) === Number(row.leaves_of_version),
      `Versão ${row.version_id} tem ${row.total} atividades para ${row.leaves_of_version} folhas de EAP.`
    );
  }

  // Dependência não pode ligar uma atividade a ela mesma nem atravessar versões.
  const dependencies = await client.query(
    `
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE d."predecessorId" = d."successorId")::int AS self_loop,
             count(*) FILTER (WHERE p."versionId" <> s."versionId")::int AS cross_version
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
    level2: 15,
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
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
