import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerGitHubOAuthRoutes } from "./github-oauth";
import { registerStorageProxy } from "./storageProxy";
import { sql } from "drizzle-orm";
import { appRouter } from "../routers";
import { getDb } from "../db";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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
    if (Array.isArray(tables) && tables.length === 0) {
      await db.execute(sql`
        CREATE TABLE project_plan_versions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          projectId INT NOT NULL,
          versionNumber INT NOT NULL,
          status ENUM('draft', 'proposed', 'approved', 'superseded') NOT NULL DEFAULT 'draft',
          baseVersionId INT NULL,
          decisionId INT NULL,
          approvedAt TIMESTAMP NULL,
          notes TEXT NULL,
          createdBy INT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE INDEX project_plan_versions_project_version_idx (projectId, versionNumber),
          INDEX project_plan_versions_project_idx (projectId),
          INDEX project_plan_versions_base_idx (baseVersionId),
          INDEX project_plan_versions_decision_idx (decisionId),
          INDEX project_plan_versions_createdby_idx (createdBy)
      `);
      // FKs adicionadas separadamente (MySQL rejeita self-reference inline e
      // nomes de tabela incorretos no mesmo CREATE TABLE).
      await db.execute(sql`
        ALTER TABLE project_plan_versions
        ADD CONSTRAINT fk_ppv_project FOREIGN KEY (projectId) REFERENCES projects(id)
      `);
    }
    const [colsSA] = await db.execute(sql`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schedule_activities' AND COLUMN_NAME = 'versionId'
    `);
    if (Array.isArray(colsSA) && colsSA.length === 0) {
      await db.execute(sql`ALTER TABLE schedule_activities ADD COLUMN versionId INT NULL`);
    }
    const [colsWN] = await db.execute(sql`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wbs_nodes' AND COLUMN_NAME = 'versionId'
    `);
    if (Array.isArray(colsWN) && colsWN.length === 0) {
      await db.execute(sql`ALTER TABLE wbs_nodes ADD COLUMN versionId INT NULL`);
    }
    const [colsSD] = await db.execute(sql`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schedule_dependencies' AND COLUMN_NAME = 'versionId'
    `);
    if (Array.isArray(colsSD) && colsSD.length === 0) {
      await db.execute(sql`ALTER TABLE schedule_dependencies ADD COLUMN versionId INT NULL`);
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
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
        branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        deployId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
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
    express.json({ limit: "50mb" }),
    (req, res, next) => {
      // @trpc/server v11 adapter extracts path via req.path.slice(req.path.lastIndexOf('/')+1)
      // req.path is relative to mount point ("/" for /api/trpc) which gives empty string
      // Override req.path to preserve full path after /api/trpc for nested routers
      const fullPath = req.originalUrl.replace("/api/trpc", "") || "/";
      Object.defineProperty(req, "path", { value: fullPath, writable: false, configurable: true });
      next();
    },
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

  server.listen(preferredPort, () => {
    console.log(`Server running on http://localhost:${preferredPort}/`);
  });
}

startServer().catch(console.error);
