import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerGitHubOAuthRoutes } from "./github-oauth";
import { registerStorageProxy } from "./storageProxy";
import { sql } from "drizzle-orm";
import { appRouter } from "../routers";
import { getDb } from "../db";
import { ENV } from "./env";
import { createContext } from "./context";
import { serveStatic } from "./serve-static";

// O schema e responsabilidade de `scripts/migrate-db.mjs`, rodado no
// pre-deploy. Nao ha, e nao deve haver, DDL no boot do servidor: um remendo
// de runtime esconde o problema em vez de resolver, e mascara divergencia
// entre o codigo e o banco.
async function logSchemaInventory() {
  const db = await getDb();
  if (!db) {
    console.warn('[schema] banco indisponivel; inventario omitido');
    return;
  }
  try {
    const names = (await listTableNames()) ?? [];
    const REQUIRED = ['users', 'projects', 'schedule_activities', 'wbs_nodes'];
    const ausentes = REQUIRED.filter(t => !names.includes(t));
    console.log(
      `[schema] ${names.length} tabela(s) no banco` +
        (ausentes.length ? ` — AUSENTE: ${ausentes.join(', ')}` : '')
    );
  } catch (error) {
    console.warn('[schema] inventario indisponivel:', error);
  }
}

async function listTableNames(): Promise<string[] | null> {
    const db = await getDb();
    if (!db) return null;
    const [tables] = await db.execute(sql`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    return Array.isArray(tables)
      ? tables.map((row: Record<string, unknown>) => String(row.TABLE_NAME))
      : [];
  }

  // Diagnostico temporario: expoe NOMES de variaveis, nunca valores. O filtro
  // tambem serve de controle -- se GITHUB_CLIENT_SECRET e DATABASE_URL aparecerem
  // aqui, a injecao de env funciona e o defeito e o nome/valor do JWT_SECRET.
  // Nao acrescentar valores: /readyz e publico.
  function configVarNames(): string[] {
    return Object.keys(process.env)
      .filter(name => /jwt|secret|session/i.test(name))
      .sort();
  }

async function startServer() {
  const app = express();
  const server = createServer(app);

  await logSchemaInventory();
  const configVars = configVarNames();
  console.log(
    `[config] variaveis de ambiente casando com jwt/secret/session (nome apenas): ${configVars.join(", ") || "(nenhuma)"}`
  );
  if (ENV.cookieSecret.length === 0) {
    console.warn(
      `[startup] JWT_SECRET ausente, vazio ou so espacos (len=${ENV.cookieSecret.length}). O boot passa e o login GitHub quebra em createSessionToken (DataError: Zero-length key is not supported). variaveis presentes: ${configVars.join(", ") || "(nenhuma)"}`
    );
  }
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerGitHubOAuthRoutes(app);
  app.get("/healthz", (_req, res) => {
      // Railway-first, com fallback Vercel para nao regredir durante a transicao.
      const commitSha =
        process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
      const branch =
        process.env.RAILWAY_GIT_COMMIT_BRANCH ?? process.env.VERCEL_GIT_COMMIT_REF;
      const deployId =
        process.env.RAILWAY_DEPLOYMENT_ID ?? process.env.VERCEL_DEPLOYMENT_ID;
      res.status(200).json({
        ok: true,
        service: "plataforma-obras-api",
        commit: commitSha?.slice(0, 7) ?? "local",
        branch: branch ?? null,
        deployId: deployId ?? null,
        environment: process.env.RAILWAY_ENVIRONMENT ?? null,
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
      const names = await listTableNames();
      const warnings: string[] = [];
      if (names && !names.includes("users")) {
        warnings.push("tabela `users` ausente: o login GitHub falha em upsertUser");
      }
      if (ENV.cookieSecret.length === 0) {
        warnings.push("JWT_SECRET vazio: o login GitHub falha em createSessionToken");
      }
      res.status(200).json({
        ok: true,
        database: "ok",
        tabelas: names?.length ?? 0,
        jwtSecretConfigurado: ENV.cookieSecret.length > 0,
        variaveisConfig: configVarNames(),
        warnings,
      });
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
      // Override req.path to preserve full path after /api/trpc for nested routers.
      // IMPORTANT: strip the query string first — leaving it in corrupts the
      // procedure name the adapter extracts (e.g. "planning.list?input=...")
      // and makes every non-batched call 404, while batched calls happen to
      // survive because the batch splitter resolves names differently.
      const rawPath = req.originalUrl.replace("/api/trpc", "") || "/";
      const fullPath = rawPath.split("?")[0] || "/";
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
    // Specifier nao-literal de proposito: o esbuild so empacota specifiers
    // literais, entao `vite` e suas devDependencies ficam fora do bundle de prod
    // (que instala so --prod). `pnpm dev` roda este arquivo via tsx, nunca o bundle.
    const devEntry = ["./", "vite"].join("");
    const { setupVite } = await import(devEntry);
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
