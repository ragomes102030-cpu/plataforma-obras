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
import { eq } from "drizzle-orm";
import { projects, projectPlanVersions, projectMcpIntegrations, users } from "../../drizzle/schema";
import { runEapQaSuite } from "../qa/eap-qa-suite";
import { runEapValidatorQaSuite } from "../qa/eap-validator-qa-suite";

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
    // `DATABASE()` e MySQL. No PostgreSQL o schema corrente e `current_schema()`,
    // e o nome da coluna volta em minuscula: identificador sem aspas dobra para
    // minuscula no PostgreSQL e nao no MySQL.
    const resultado = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema()
    `);
    // O `execute` do MySQL devolvia `[linhas, campos]`; o do PostgreSQL devolve
    // um `QueryResult`, que nao e array. Desestruturar aqui dava `undefined` sem
    // erro, e o `/readyz` reportaria zero tabelas num banco cheio.
    const linhas = (resultado as { rows?: Record<string, unknown>[] }).rows ?? [];
    return linhas.map(linha => String(linha.table_name));
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
      // O Render vem PRIMEIRO, porque é onde o sistema roda. As duas casas
      // antigas ficaram depois: sem elas, nenhuma variável existe no Render e o
      // `/healthz` respondia `commit: "local"` — que é indistinguível de "rodei
      // na minha máquina", e foi o que fez o deploy parecer que não acontecia.
      //
      // OS NOMES FORAM LIDOS DA DOCUMENTACAO, e nao deduzidos por analogia. A
      // primeira versao escreveu `RENDER_GIT_COMMIT_SHA` e
      // `RENDER_GIT_COMMIT_BRANCH`, por analogia com a Railway e a Vercel: os
      // dois nomes nao existem. O `?? "local"` engolia o `undefined` e o
      // endpoint voltava a dizer "local" com o codigo novo no ar — a mesma
      // falha que motivou a mudanca, repetida por um nome errado.
      const commitSha =
        process.env.RENDER_GIT_COMMIT ??
        process.env.RAILWAY_GIT_COMMIT_SHA ??
        process.env.VERCEL_GIT_COMMIT_SHA;
      const branch =
        process.env.RENDER_GIT_BRANCH ??
        process.env.RAILWAY_GIT_COMMIT_BRANCH ??
        process.env.VERCEL_GIT_COMMIT_REF;
      const deployId =
        process.env.RENDER_INSTANCE_ID ??
        process.env.RAILWAY_DEPLOYMENT_ID ??
        process.env.VERCEL_DEPLOYMENT_ID;
      res.status(200).json({
        ok: true,
        service: "plataforma-obras-api",
        commit: commitSha?.slice(0, 7) ?? "local",
        branch: branch ?? null,
        deployId: deployId ?? null,
        environment: process.env.RENDER_SERVICE_TYPE ?? null,
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

  app.get("/internal/qa/eap", async (req, res) => {
    const expected = process.env.QA_RUNNER_SECRET?.trim();
    const supplied = typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!expected || !supplied || supplied !== expected) { res.status(404).json({ ok: false }); return; }
    const db = await getDb();
    if (!db) { res.status(503).json({ ok: false, error: "Banco de dados não configurado." }); return; }
    try {
      const [owner] = await db.select({ id: users.id }).from(users).orderBy(users.id).limit(1);
      if (!owner) throw new Error("Nenhum usuário disponível para o ambiente QA.");
      let [project] = await db.select().from(projects).where(eq(projects.code, "ARQUIMEDES-QA")).limit(1);
      if (!project) {
        const plannedStart = new Date(); const plannedFinish = new Date(plannedStart.getTime() + 180 * 86400000);
        const [projectId] = await db.insert(projects).values({ ownerUserId: owner.id, code: "ARQUIMEDES-QA", name: "ARQUIMEDES — Ambiente QA", location: "Ambiente isolado de testes", descricao: "Obra técnica exclusiva para testes automatizados do Arquimedes. Não representa obra de cliente.", tipoDeObra: "edificio", status: "Planejamento", progress: 0, plannedStart, plannedFinish }).$returningIds();
        if (!projectId) throw new Error("Não foi possível criar a obra QA.");
        await db.insert(projectPlanVersions).values({ projectId, versionNumber: 1, status: "draft", baseVersionId: null, createdBy: owner.id, notes: "Versão inicial exclusiva para testes automatizados do Arquimedes." });
        const mcpRows = ([["eap", process.env.MCP_EAP_URL], ["cronograma", process.env.MCP_CRONOGRAMA_URL], ["ganttLob", process.env.MCP_GANTT_LOB_URL]] as const).map(([provider, baseUrl]) => ({ projectId, provider, externalProjectId: "ARQUIMEDES-QA", endpointUrl: baseUrl ? String(baseUrl).replace(/\/$/, "") + (String(baseUrl).endsWith("/mcp") ? "" : "/mcp") : "", syncState: "pending" as const, lastError: null }));
        await db.insert(projectMcpIntegrations).values(mcpRows);
        [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      }
      if (!project || project.deletedAt) throw new Error("Obra ARQUIMEDES-QA indisponível.");
      const result = await runEapQaSuite({ db, projectId: project.id, userId: owner.id, mcpProjectIds: { eap: "ARQUIMEDES-QA", cronograma: "ARQUIMEDES-QA", ganttLob: "ARQUIMEDES-QA" } });
      res.status(result.status === "passed" ? 200 : 422).json({ ok: result.status === "passed", ...result });
    } catch (error) { console.error("[qa] execução HTTP falhou:", error); res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Falha desconhecida no QA." }); }
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
    console.log("[qa-boot] QA_RUNNER_ON_BOOT =", process.env.QA_RUNNER_ON_BOOT === "true" ? "true" : "false");
    if (process.env.QA_RUNNER_ON_BOOT === "true") {
      setTimeout(async () => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Banco de dados não configurado.");
          const [owner] = await db.select({ id: users.id }).from(users).orderBy(users.id).limit(1);
          if (!owner) throw new Error("Nenhum usuário disponível para o ambiente QA.");
          let [project] = await db.select().from(projects).where(eq(projects.code, "ARQUIMEDES-QA")).limit(1);
          if (!project) {
            const plannedStart = new Date();
            const plannedFinish = new Date(plannedStart.getTime() + 180 * 86400000);
            const [projectId] = await db.insert(projects).values({ ownerUserId: owner.id, code: "ARQUIMEDES-QA", name: "ARQUIMEDES — Ambiente QA", location: "Ambiente isolado de testes", descricao: "Obra técnica exclusiva para testes automatizados do Arquimedes. Não representa obra de cliente.", tipoDeObra: "edificio", status: "Planejamento", progress: 0, plannedStart, plannedFinish }).$returningIds();
            if (!projectId) throw new Error("Não foi possível criar a obra QA.");
            await db.insert(projectPlanVersions).values({ projectId, versionNumber: 1, status: "draft", baseVersionId: null, createdBy: owner.id, notes: "Versão inicial exclusiva para testes automatizados do Arquimedes." });
            const mcpRows = ([["eap", process.env.MCP_EAP_URL], ["cronograma", process.env.MCP_CRONOGRAMA_URL], ["ganttLob", process.env.MCP_GANTT_LOB_URL]] as const).map(([provider, baseUrl]) => ({ projectId, provider, externalProjectId: "ARQUIMEDES-QA", endpointUrl: baseUrl ? String(baseUrl).replace(/\/$/, "") + (String(baseUrl).endsWith("/mcp") ? "" : "/mcp") : "", syncState: "pending" as const, lastError: null }));
            await db.insert(projectMcpIntegrations).values(mcpRows);
            [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
          }
          if (!project || project.deletedAt) throw new Error("Obra ARQUIMEDES-QA indisponível.");
          const result = await runEapQaSuite({ db, projectId: project.id, userId: owner.id, mcpProjectIds: { eap: "ARQUIMEDES-QA", cronograma: "ARQUIMEDES-QA", ganttLob: "ARQUIMEDES-QA" } });
          console.log("[qa-boot] RESULTADO EAP VALIDATOR QA:", JSON.stringify(runEapValidatorQaSuite()));
          console.log("[qa-boot] RESULTADO EAP QA:", JSON.stringify(result));
        } catch (error) {
          console.error("[qa-boot] execução EAP QA falhou:", error);
        }
      }, 3000);
    }
  });
}

startServer().catch(console.error);
