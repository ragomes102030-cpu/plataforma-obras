import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerGitHubOAuthRoutes } from "./github-oauth";
import { registerStorageProxy } from "./storageProxy";
import { sql } from "drizzle-orm";
import { appRouter } from "../routers";
import { getDb } from "../db";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function ensurePlanVersionSchema() {
  const db = await getDb();
  if (!db) {
    console.warn('ensurePlanVersionSchema: database unavailable, skipping');
    return;
  }
  try {
    const [tables] = await db.execute(sql`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_plan_versions'
    `);
    if (((tables as any[]).length ?? 0) === 0) {
      await db.execute(sql`
        CREATE TABLE project_plan_versions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          projectId INT NOT NULL REFERENCES projects(id),
          versionNumber INT NOT NULL,
          status ENUM('draft', 'proposed', 'approved', 'superseded') NOT NULL DEFAULT 'draft',
          baseVersionId INT REFERENCES project_plan_versions(id),
          decisionId INT REFERENCES agentDecisions(id),
          approvedAt TIMESTAMP,
          notes TEXT,
          createdBy INT REFERENCES users(id),
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE INDEX project_plan_versions_project_version_idx (projectId, versionNumber),
          INDEX project_plan_versions_project_idx (projectId)
      `);
    }
    const [colsSA] = await db.execute(sql`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schedule_activities' AND COLUMN_NAME = 'versionId'
    `);
    if (((colsSA as any[]).length ?? 0) === 0) {
      await db.execute(sql`ALTER TABLE schedule_activities ADD COLUMN versionId INT NULL REFERENCES project_plan_versions(id)`);
    }
    const [colsWN] = await db.execute(sql`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wbs_nodes' AND COLUMN_NAME = 'versionId'
    `);
    if (((colsWN as any[]).length ?? 0) === 0) {
      await db.execute(sql`ALTER TABLE wbs_nodes ADD COLUMN versionId INT NULL REFERENCES project_plan_versions(id)`);
    }
    const [colsSD] = await db.execute(sql`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schedule_dependencies' AND COLUMN_NAME = 'versionId'
    `);
    if (((colsSD as any[]).length ?? 0) === 0) {
      await db.execute(sql`ALTER TABLE schedule_dependencies ADD COLUMN versionId INT NULL REFERENCES project_plan_versions(id)`);
    }
  } catch (error) {
    console.warn('ensurePlanVersionSchema error (non-fatal):', error);
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  await ensurePlanVersionSchema();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerGitHubOAuthRoutes(app);
  app.get("/healthz", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "plataforma-obras-api",
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "local",
      branch: process.env.RENDER_GIT_BRANCH ?? null,
      deployId: process.env.RENDER_DEPLOY_ID ?? null,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });
  app.get("/readyz", async (_req, res) => {
    const db = await getDb();
    if (!db) {
      res.status(503).json({ ok: false, database: "indisponivel" });
      return;
    }
    try {
      await db.execute(sql`SELECT 1`);
      res.status(200).json({ ok: true, database: "ok" });
    } catch (error) {
      console.error("[readyz] banco inacessivel:", error);
      res.status(503).json({ ok: false, database: "erro" });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
