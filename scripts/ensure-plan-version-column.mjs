import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('DATABASE_URL not set; skipping plan-version column ensure');
  process.exit(0);
}

const databaseUrl = new URL(url);
const sslMode = databaseUrl.searchParams.get('ssl-mode');
databaseUrl.searchParams.delete('ssl-mode');

const conn = await createConnection({
  uri: databaseUrl.toString(),
  ...(sslMode && sslMode !== 'disabled' ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
  const [cols] = await conn.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schedule_activities' AND COLUMN_NAME = 'versionId'"
  );
  if (cols.length === 0) {
    await conn.query(
      "ALTER TABLE schedule_activities ADD COLUMN `versionId` int NULL COMMENT 'plano version' REFERENCES project_plan_versions(id)"
    );
    console.log('ensure: added versionId to schedule_activities');
  } else {
    console.log('ensure: versionId already exists on schedule_activities');
  }
} finally {
  await conn.end();
}
