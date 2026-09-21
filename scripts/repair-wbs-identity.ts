import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.log("[WBS] DATABASE_URL ausente; saneamento ignorado no ambiente local.");
  process.exit(0);
}

function connectionOptions(urlValue: string) {
  const url = new URL(urlValue);
  const sslMode = url.searchParams.get("ssl-mode")?.toLowerCase();
  url.searchParams.delete("ssl-mode");
  return {
    uri: url.toString(),
    ...(sslMode && sslMode !== "disabled"
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  };
}

type DuplicateGroup = {
  projectId: number;
  code: string;
  ids: string;
};

type Candidate = {
  id: number;
  externalId: string | null;
  externalUid: string | null;
  activityRefs: number;
  budgetRefs: number;
};

const connection = await mysql.createConnection(connectionOptions(databaseUrl));

try {
  await connection.beginTransaction();
  const [duplicateRows] = await connection.query<DuplicateGroup[]>(`
    SELECT
      projectId,
      code,
      GROUP_CONCAT(id ORDER BY id SEPARATOR ',') AS ids
    FROM wbs_nodes
    GROUP BY projectId, code
    HAVING COUNT(*) > 1
    ORDER BY projectId, code
  `);

  if (!duplicateRows.length) {
    console.log("[WBS] Nenhum código duplicado encontrado.");
  } else for (const duplicate of duplicateRows) {
    const ids = duplicate.ids
      .split(",")
      .map(Number)
      .filter(Number.isInteger);
    if (ids.length < 2) continue;

    const [candidates] = await connection.query<Candidate[]>(
      `
        SELECT
          node.id,
          node.externalId,
          node.externalUid,
          (
            SELECT COUNT(*)
            FROM schedule_activities activity
            WHERE activity.projectId = node.projectId
              AND activity.wbsNodeId = node.id
          ) AS activityRefs,
          (
            SELECT COUNT(*)
            FROM budget_items item
            WHERE item.wbsNodeId = node.id
          ) AS budgetRefs
        FROM wbs_nodes node
        WHERE node.projectId = ?
          AND node.code = ?
        ORDER BY
          (CASE WHEN node.externalId IS NOT NULL THEN 100000 ELSE 0 END)
          + (activityRefs * 1000)
          + (budgetRefs * 100) DESC,
          node.id ASC
      `,
      [duplicate.projectId, duplicate.code]
    );

    const canonical = candidates[0];
    if (!canonical) continue;
    const losers = candidates.slice(1);

    for (const loser of losers) {
      await connection.query(
        `
          UPDATE wbs_nodes
          SET parentId = ?
          WHERE projectId = ?
            AND parentId = ?
        `,
        [canonical.id, duplicate.projectId, loser.id]
      );
      await connection.query(
        `
          UPDATE schedule_activities
          SET wbsNodeId = ?, wbsCode = ?, eapRef = ?
          WHERE projectId = ?
            AND wbsNodeId = ?
        `,
        [canonical.id, duplicate.code, duplicate.code, duplicate.projectId, loser.id]
      );
      await connection.query(
        `
          UPDATE budget_items
          SET wbsNodeId = ?
          WHERE wbsNodeId = ?
        `,
        [canonical.id, loser.id]
      );
      await connection.query(
        `
          DELETE FROM wbs_nodes
          WHERE projectId = ?
            AND id = ?
        `,
        [duplicate.projectId, loser.id]
      );
    }

    console.log(
      `[WBS] projeto=${duplicate.projectId} código=${duplicate.code} canonical=${canonical.id} removidos=${losers.map(item => item.id).join(",")}`
    );
  }

  const [uniqueIndexRows] = await connection.query<{ indexName: string }[]>(
    `
      SELECT DISTINCT index_name AS indexName
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'wbs_nodes'
        AND index_name = 'wbs_nodes_project_code_unique_idx'
    `
  );
  if (!uniqueIndexRows.length) {
    await connection.query(
      `
        ALTER TABLE wbs_nodes
        ADD UNIQUE INDEX wbs_nodes_project_code_unique_idx (projectId, code)
      `
    );
    console.log("[WBS] Constraint única projectId+code criada.");
  }

  await connection.commit();
  console.log("[WBS] Saneamento concluído; db:push poderá criar a constraint única.");
} catch (error) {
  await connection.rollback();
  console.error("[WBS] Saneamento revertido:", error);
  process.exitCode = 1;
} finally {
  await connection.end();
}
