import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    "[WBS] DATABASE_URL é obrigatória para a migração de integridade."
  );
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

type ColumnRow = { isNullable: "YES" | "NO" };
type CountRow = { count: number };

const connection = await mysql.createConnection(connectionOptions(databaseUrl));

const query = async <T extends mysql.RowDataPacket[] | mysql.ResultSetHeader[]>(
  sql: string,
  params: unknown[] = []
) => {
  const [rows] = await connection.query<T>(sql, params);
  return rows;
};

try {
  const [nullActivities] = await query<CountRow[]>(
    "SELECT COUNT(*) AS count FROM schedule_activities WHERE wbsNodeId IS NULL"
  );
  if (Number(nullActivities[0]?.count ?? 0) > 0) {
    throw new Error(
      `[WBS] Migração interrompida: ainda existem ${nullActivities[0].count} atividades sem wbsNodeId após o saneamento.`
    );
  }

  const [duplicateCodes] = await query<CountRow[]>(
    `SELECT COUNT(*) AS count FROM (
       SELECT projectId, code
       FROM wbs_nodes
       GROUP BY projectId, code
       HAVING COUNT(*) > 1
     ) duplicates`
  );
  if (Number(duplicateCodes[0]?.count ?? 0) > 0) {
    throw new Error(
      "[WBS] Migração interrompida: existem códigos WBS duplicados."
    );
  }

  const [column] = await query<ColumnRow[]>(
    `SELECT IS_NULLABLE AS isNullable
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'schedule_activities'
        AND column_name = 'wbsNodeId'`
  );
  if (!column[0]) {
    throw new Error("[WBS] A coluna schedule_activities.wbsNodeId não existe.");
  }

  // DDL não é transacional em MySQL: cada alteração abaixo é idempotente e
  // guardada por information_schema, então reexecutar a migração é seguro.
  if (column[0].isNullable === "YES") {
    await connection.query(
      "ALTER TABLE schedule_activities MODIFY COLUMN wbsNodeId int NOT NULL"
    );
    console.log("[WBS] wbsNodeId alterado para NOT NULL.");
  } else {
    console.log("[WBS] wbsNodeId já é NOT NULL.");
  }

  const [activityForeignKey] = await query<CountRow[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND table_name = 'schedule_activities'
        AND column_name = 'wbsNodeId'
        AND referenced_table_name = 'wbs_nodes'
        AND referenced_column_name = 'id'`
  );
  if (Number(activityForeignKey[0]?.count ?? 0) === 0) {
    await connection.query(
      `ALTER TABLE schedule_activities
       ADD CONSTRAINT schedule_activities_wbsNodeId_wbs_nodes_id_fk
       FOREIGN KEY (wbsNodeId) REFERENCES wbs_nodes(id)
       ON DELETE RESTRICT ON UPDATE NO ACTION`
    );
    console.log("[WBS] Foreign key atividade → EAP criada.");
  } else {
    console.log("[WBS] Foreign key atividade → EAP já existe.");
  }

  const [parentForeignKey] = await query<CountRow[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND table_name = 'wbs_nodes'
        AND column_name = 'parentId'
        AND referenced_table_name = 'wbs_nodes'
        AND referenced_column_name = 'id'`
  );
  if (Number(parentForeignKey[0]?.count ?? 0) === 0) {
    await connection.query(
      `ALTER TABLE wbs_nodes
       ADD CONSTRAINT wbs_nodes_parentId_wbs_nodes_id_fk
       FOREIGN KEY (parentId) REFERENCES wbs_nodes(id)
       ON DELETE RESTRICT ON UPDATE NO ACTION`
    );
    console.log("[WBS] Foreign key pai → EAP criada.");
  } else {
    console.log("[WBS] Foreign key pai → EAP já existe.");
  }

  console.log(
    "[WBS] Migração de integridade concluída sem operação destrutiva."
  );
} catch (error) {
  console.error("[WBS] Migração de integridade interrompida:", error);
  process.exitCode = 1;
} finally {
  await connection.end();
}
