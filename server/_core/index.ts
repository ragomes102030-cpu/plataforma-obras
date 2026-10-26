import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerGitHubOAuthRoutes } from "./github-oauth";
import { registerStorageProxy } from "./storageProxy";
import { count, desc, gte, sql } from "drizzle-orm";
import { appRouter } from "../routers";
import { getDb, validateDatabaseConfiguration } from "../db";
import { ENV } from "./env";
import { origemDeploy } from "./deploy-info";
import { createContext } from "./context";
import { serveStatic } from "./serve-static";
import { eq } from "drizzle-orm";
import { errorEvents, projects, projectPlanVersions, projectMcpIntegrations, users } from "../../drizzle/schema";
import { registrarErro } from "../observability/error-tracker";
import { runEapQaSuite } from "../qa/eap-qa-suite";
import { runEapValidatorQaSuite } from "../qa/eap-validator-qa-suite";
import { runEapValidatorQaSuiteV2 } from "../qa/eap-validator-qa-suite-v2";
import { runCompleteEapQaSuite } from "../qa/complete-eap-qa-suite";
import { runBrainSkillsQaSuite } from "../qa/brain-skills-qa-suite";
import { startTrashRetentionJob } from "../trash-retention";

// O schema e responsabilidade de `scripts/migrate-db.mjs`, rodado no
// pre-deploy. Nao ha, e nao deve haver, DDL no boot do servidor: um remendo
// de runtime esconde o problema em vez de resolver, e mascara divergencia
// entre o codigo e o banco.
async function logSchemaInventory() {
  const db = await getDb();
  if (!db) {
    const message = '[schema] banco indisponivel';
    if (process.env.NODE_ENV === "production") throw new Error(message);
    console.warn(message + '; inventario omitido');
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
    console.error('[schema] inventario indisponivel:', error);
    // Em produção, falha de autenticação/conectividade do banco principal deve
    // impedir que o Render anuncie a API como "Live" enquanto ela está incapaz
    // de operar. Em desenvolvimento, mantemos o boot tolerante.
    if (process.env.NODE_ENV === "production") throw error;
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
  if (process.env.NODE_ENV === "production") validateDatabaseConfiguration();
  const app = express();
  const server = createServer(app);

  console.log("[schema] backend de banco configurado por DATABASE_URL");
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
  // ---- Segurança de transporte -------------------------------------------------
  // O app roda atrás do proxy do Render (um hop: `X-Forwarded-For` do cliente).
  // Sem isto `req.ip` seria sempre o IP do proxy, e o rate limit viraria um
  // balde único para todo mundo.
  app.set("trust proxy", 1);

  // helmet sem CSP: a política padrão bloqueia o runtime inline do Vite e os
  // assets em data:. Os outros cabeçalhos não quebram nada.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // CORS só importa quando o navegador abre a API de outra origem. Em produção a
  // allowlist é a URL pública; em desenvolvimento, o Vite. Requisição same-origin
  // (o caso normal) não manda Origin e passa direto.
  const origensPermitidas = [
    ENV.publicAppUrl,
    ...(process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:5173", "http://127.0.0.1:5173"]),
  ].filter((origem): origem is string => Boolean(origem));
  app.use(
    cors({
      origin(origem, callback) {
        if (!origem || origensPermitidas.includes(origem)) return callback(null, true);
        // Nega sem lançar erro: o navegador bloqueia, e a API não devolve 500.
        return callback(null, false);
      },
      credentials: true,
    })
  );

  // Teto de corpo de 1 MB. As duas únicas procedures que recebem arquivo em
  // base64 mantêm 50 MB, e o parser grande precisa ser montado ANTES do global:
  // `express.json` marca `req._body` e o seguinte é ignorado.
  const CAMINHOS_DE_UPLOAD =
    /^\/api\/trpc\/(catalog\.importPriceSheet|documents\.upload)([,?]|$)/;
  const jsonGrande = express.json({ limit: "50mb" });
  app.use((req, res, next) =>
    CAMINHOS_DE_UPLOAD.test(req.originalUrl) ? jsonGrande(req, res, next) : next()
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Rate limit só na API e no login. Health/ready ficam de fora de propósito: se
  // o healthcheck do Render tomar 429, o deploy é dado como morto.
  // 1.000 por 15 min por IP (~66/min) cobre com folga a tela mais pesada e ainda
  // corta laço de script. Ajustável por RATE_LIMIT_MAX sem tocar no código.
  const limitePorJanela = Number(process.env.RATE_LIMIT_MAX ?? 1000);
  app.use(
    ["/api/trpc", "/api/auth"],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: Number.isFinite(limitePorJanela) && limitePorJanela > 0 ? limitePorJanela : 1000,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: req => req.method === "OPTIONS",
      message: {
        error: "Muitas requisicoes em pouco tempo. Aguarde alguns minutos e tente de novo.",
      },
    })
  );
  registerStorageProxy(app);
  registerGitHubOAuthRoutes(app);
  app.get("/healthz", (_req, res) => {
    // A identificacao do deploy vem de `./deploy-info`: funcao pura, com testes
    // proprios. O metodo mudou de proposito.
    //
    // Antes este bloco adivinhava o NOME da variavel da plataforma
    // (`RENDER_GIT_COMMIT`, `RAILWAY_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_SHA`) e
    // terminava em `?? "local"`. Quando a plataforma virou o DockHosting, nenhum
    // dos tres nomes existia, e o `/healthz` voltou a dizer `commit: "local"` com
    // o codigo novo no ar — a mesma falha que motivou a mudanca, repetida por um
    // nome errado. Adivinhar nome de variavel falha em silencio.
    //
    // Agora a busca e por PADRAO de nome, e o valor so e aceito se PARECER o que
    // diz ser (commit e hexadecimal de 7 a 40 digitos). `commitSource` diz qual
    // variavel respondeu, ou `"nao-encontrado"`: entao a propria resposta do
    // endpoint revela como a plataforma se identifica, sem depender de doc. Hoje
    // responde `commitSource: "RENDER_GIT_COMMIT"`.
    res.status(200).json({
      ok: true,
      service: "plataforma-obras-api",
      ...origemDeploy(),
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
        // `variaveisConfig` saiu daqui: /readyz e publico e sem autenticacao, e
        // publicar os NOMES de GITHUB_CLIENT_SECRET / JWT_SECRET / QA_RUNNER_SECRET
        // entrega o mapa da superficie a quem so precisava saber se o servico
        // responde. O mesmo dado continua no log de boot (linha ~88), que e
        // interno — diagnostico preservado, exposicao removida.
        warnings,
      });
    } catch (error) {
      console.error("[readyz] banco inacessivel:", error);
      res.status(503).json({ ok: false, database: "erro" });
    }
  });

  // Observabilidade de erros 5xx sem dependencia de SaaS. Protegido por
  // OPS_TOKEN; sem a variavel o endpoint responde 404 (nao revela que existe).
  app.get("/internal/ops/errors", async (req, res) => {
    const expected = process.env.OPS_TOKEN?.trim();
    const supplied = typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!expected || !supplied || supplied !== expected) { res.status(404).json({ ok: false }); return; }
    const db = await getDb();
    if (!db) { res.status(503).json({ ok: false, error: "Banco de dados indisponivel." }); return; }
    try {
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const ultimos = await db
        .select()
        .from(errorEvents)
        .orderBy(desc(errorEvents.createdAt))
        .limit(50);
      const grupos = await db
        .select({
          fingerprint: errorEvents.fingerprint,
          rota: errorEvents.rota,
          status: errorEvents.status,
          codigo: errorEvents.codigo,
          mensagem: errorEvents.mensagem,
          ocorrencias: count(),
          ultimaEm: sql<string>`max(${errorEvents.createdAt})`,
        })
        .from(errorEvents)
        .where(gte(errorEvents.createdAt, desde))
        .groupBy(
          errorEvents.fingerprint,
          errorEvents.rota,
          errorEvents.status,
          errorEvents.codigo,
          errorEvents.mensagem
        )
        .orderBy(desc(count()))
        .limit(20);
      res.status(200).json({ ok: true, janelaHoras: 24, grupos, ultimos });
    } catch (error) {
      console.error("[ops] falha ao ler error_events:", error);
      res.status(500).json({ ok: false, error: "Falha ao ler os erros." });
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
      if (project?.deletedAt) {
        // O código é UNIQUE: recriar violaria a constraint. Reverter o soft-delete
        // preserva o id histórico e as versões/integrações já gravadas.
        await db.update(projects).set({ deletedAt: null, deletedAtBy: null }).where(eq(projects.id, project.id));
        [project] = await db.select().from(projects).where(eq(projects.id, project.id)).limit(1);
      }
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
      onError({ error, path, ctx }) {
        // O adapter devolve erro de procedure como JSON 200; sem este gancho,
        // uma procedure quebrada nao aparecia em lugar nenhum. So 5xx: 4xx e
        // fluxo esperado (validacao, nao autorizado) e viraria ruido.
        if (error.code !== "INTERNAL_SERVER_ERROR") return;
        registrarErro({
          origem: "trpc",
          rota: `/api/trpc/${path ?? "desconhecido"}`,
          codigo: error.code,
          mensagem: error.message,
          stack: error.stack,
          userId: ctx?.user?.id ?? null,
        });
      },
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

  // Erros do Express (JSON malformado, upload, rota que chama next(err)).
  // Fica depois de tudo para capturar o que escapou do tRPC e do estatico.
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const e = err as {
        status?: number;
        statusCode?: number;
        type?: string;
        message?: string;
        stack?: string;
      };
      const status = Number(e.status ?? e.statusCode ?? 500);
      if (status >= 500) {
        registrarErro({
          origem: "http",
          rota: req.originalUrl,
          metodo: req.method,
          status,
          codigo: e.type ?? null,
          mensagem: e.message ?? "Erro interno sem mensagem",
          stack: e.stack ?? null,
          userId: (req as express.Request & { user?: { id?: number } }).user?.id ?? null,
        });
      }
      if (res.headersSent) {
        next(err);
        return;
      }
      res.status(status).json({
        error:
          status >= 500
            ? "Erro interno do servidor."
            : e.message ?? "Requisicao invalida.",
      });
    }
  );

  const preferredPort = parseInt(process.env.PORT || "3000");

  server.listen(preferredPort, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${preferredPort}/`);
    startTrashRetentionJob();
    console.log("[qa-boot] QA_RUNNER_ON_BOOT =", process.env.QA_RUNNER_ON_BOOT === "true" ? "true" : "false");
    if (process.env.QA_RUNNER_ON_BOOT === "true") {
      setTimeout(async () => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Banco de dados não configurado.");
          const [owner] = await db.select({ id: users.id }).from(users).orderBy(users.id).limit(1);
          if (!owner) throw new Error("Nenhum usuário disponível para o ambiente QA.");
          let [project] = await db.select().from(projects).where(eq(projects.code, "ARQUIMEDES-QA")).limit(1);
          if (project?.deletedAt) {
            // O código é UNIQUE: recriar violaria a constraint. Reverter o soft-delete
            // preserva o id histórico e as versões/integrações já gravadas.
            await db.update(projects).set({ deletedAt: null, deletedAtBy: null }).where(eq(projects.id, project.id));
            [project] = await db.select().from(projects).where(eq(projects.id, project.id)).limit(1);
          }
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
          console.log("[qa-boot] RESULTADO EAP VALIDATOR QA V2:", JSON.stringify(runEapValidatorQaSuiteV2()));
          console.log("[qa-boot] RESULTADO COMPLETE EAP QA:", JSON.stringify(runCompleteEapQaSuite()));
          console.log("[qa-boot] RESULTADO BRAIN + SKILLS QA:", JSON.stringify(await runBrainSkillsQaSuite({ ownerUserId: owner.id, projectId: project.id })));
          console.log("[qa-boot] RESULTADO EAP QA:", JSON.stringify(result));
        } catch (error) {
          console.error("[qa-boot] execução EAP QA falhou:", error);
        }
      }, 3000);
    }
  });
}

startServer().catch(console.error);
