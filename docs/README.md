# Plataforma Obras — Base de Conhecimento

Última atualização: 26/09/2026

---

## Visão geral

Plataforma Obras é um sistema de planejamento e gestão de obras feito em TypeScript, com frontend Vite + React, backend Express + tRPC, e banco de dados MySQL via Aiven. O frontend está hospedado no Vercel, com auto-deploy via GitHub.

**URL do sistema:** https://plataforma-obras-8uhqy3k5f-rafael-5864.vercel.app

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend: Vite + React (client/)                          │
│  - App.tsx: ponto de entrada                              │
│  - Componentes: Radix UI, TailwindCSS, tRPC client         │
└─────────────────────────────────────────────────────────────┘
                              │ tRPC (HTTP)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend: Express + tRPC (server/_core/)                   │
│  - index.ts: servidor Express + tRPC                       │
│  - routers.ts: definições dos routers                      │
│  - db.ts: conexão com banco (Drizzle ORM + MySQL)          │
│  - integrations/: MCPs e integrações                       │
│  - agent/: lógica do agente                                │
│  - construction/: cálculos CPM, dependências                │
└─────────────────────────────────────────────────────────────┘
                              │ Drizzle ORM
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Banco de dados: MySQL 8 via Aiven                         │
│  - Host: mysql-1ca8c074-grafaelalexandre-fe80.f.aivencloud.com │
│  - Port: 27571                                             │
│  - SSL: REQUIRED                                           │
│  - DATABASE_URL: mysql://avnadmin:***@... (ver .env.local) │
└─────────────────────────────────────────────────────────────┘
```

### Dependências principais

| Pacote | Versão | Uso |
|---|---|---|
| React | 19.x | UI |
| Vite | 5.x | Build do frontend |
| tRPC | 11.x | API client/server |
| Drizzle ORM | latest | ORM para MySQL |
| Radix UI | vários | Componentes UI |
| TailwindCSS | 3.x | Estilização |
| React Query (TanStack) | 5.x | Cache/server state |
| React Hook Form | latest | Formulários |
| Lucide React | latest | Ícones |
| Framer Motion | latest | Animações |
| shadcn/ui | (via Radix) | Componentes |

---

## Hospedagem

### Vercel

- **Projeto:** plataforma-obras
- **Team:** rafael-5864
- **Deploy URL:** https://plataforma-obras-8uhqy3k5f-rafael-5864.vercel.app
- **Auto-deploy:** Sim, via GitHub connected

**vercel.json:**
```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist/public",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": "vite"
}
```

**Build script (`package.json`):**
```json
"build": "vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist"
```

### Render (RENDIDO — sem uso agora)

Todos os serviços foram migrados do Render para o Vercel. O `render.yaml` ainda existe mas sem uso ativo.

---

## Banco de dados

### Aiven MySQL

- **Serviço:** MySQL 8 em Aiven
- **Host:** `mysql-1ca8c074-grafaelalexandre-fe80.f.aivencloud.com`
- **Porta:** 27571
- **Banco:** `defaultdb`
- **Usuário:** `avnadmin`
- **SSL:** `ssl-mode=REQUIRED`

**DATABASE_URL:** `mysql://avnadmin:***@mysql-1ca8c074-grafaelalexandre-fe80.f.aivencloud.com:27571/defaultdb?ssl-mode=REQUIRED`

*(Token completo em .env.local — protegido por .gitignore)*

### Drizzle ORM

Usa Drizzle ORM para migrations e schema. Scripts na raiz:
- `pnpm db:push` — push do schema para o banco
- `pnpm db:migrate:integrity` — migração de integridade WBS

---

## MCPs configurados (30 habilitados)

### Construção / Planejamento

| Nome | Tipo | Descrição |
|---|---|---|
| `aiven` | stdio | Acessa banco MySQL via Aiven (npx @modelcontextprotocol/server-http) |
| `plataforma-obra` | stdio | MCP do próprio sistema (node dist/index.js) |
| `cronograma` | http | Cronograma PERT/CPM via MCP |
| `mcp-cronograma-server` | sse | Cronograma server (SSE) |
| `Mcp-Cronograma` | http | Cronograma (streamable HTTP, system_default_user) |
| `MCP Cronograma` | http | Cronograma (http, system_default_user) |
| `MCP Cronograma Server` | sse | Cronograma server SSE (user_...) |
| `MCP Cronograma Server` | http | duplicata? |

### EAP (Estrutura Analítica)

| Nome | Tipo | Descrição |
|---|---|---|
| `eap` | — | EAP MCP (sem config detalhada) |
| `mcp-eap-server` | http | EAP server (SSE via MCP) |
| `MCP EAP` | http | EAP MCP (http, system_default_user) |
| `MCP EAP Server` | sse | EAP server SSE (user_...) |
| `MCP EAP Server` | http | EAP server http (user_...) |
| `MCP EAP Server` | sse | duplicata? |

### Gantt e Linha de Balanço

| Nome | Tipo | Descrição |
|---|---|---|
| `gantt` | — | Gantt MCP |
| `mcp-gantt-lob-server` | http | Gantt LOB server (http) |
| `MCP Gantt LOB` | http | Gantt LOB MCP (http, system_default_user) |
| `MCP Gantt LOB Server` | sse | Gantt LOB server SSE (user_...) |

### Outros

| Nome | Tipo | Descrição |
|---|---|---|
| `aionui-browser` | stdio | Browser automation nativo do AionUi (x3 instâncias) |
| `excel` | stdio | Excel via MCP |
| `excel-mcp-server` | stdio | Excel MCP server (openpyxl) |
| `lean-planning` | stdio | Lean Planning MCP (local: Desktop/AionUi clone/tools/) |
| `lean-planning-mcp` | stdio | duplicata do lean-planning? |
| `osmmcp` | stdio | OpenStreetMap, geocoding, rotas |
| `render` | stdio | Render deployment MCP (@niyogi/render-mcp) x2 |
| `saga-mcp` | stdio | Task tracking tipo Jira (SQLite backend) |
| `whatsapp` | stdio | WhatsApp via Baileys |

### Novos (adicionados em set/2026)

| Nome | Tipo | Descrição | Status |
|---|---|---|---|
| `autodesk-bim` | sse | BIM, Fusion 360, Construction Cloud, Revit, Civil 3D | ⚠️ precisa token |
| `linear` | sse | Project tracking, issues, sprints | ⚠️ precisa token |
| `clickup` | sse | Project management, Kanban, Gantt (Free tier) | ⚠️ precisa token |
| `composio` | sse | 1.500+ integrações | ✅ token configurado |

---

## Environment variables

### .env.local (protegido por .gitignore)

```
DATABASE_URL=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_TOKEN=<configure-no-ambiente>
VERCEL_OIDC_TOKEN=<configure-no-ambiente>
COMPASIO_API_KEY=<configure-no-ambiente>
```

### Vercel env vars (via Vercel dashboard)

- `DATABASE_URL` ✅
- `PUBLIC_APP_URL` = https://plataforma-obras-8uhqy3k5f-rafael-5864.vercel.app
- `MCP_EAP_URL` = https://mcp-eap-server.onrender.com
- `MCP_CRONOGRAMA_URL` = https://mcp-cronograma-server.onrender.com
- `MCP_GANTT_LOB_URL` = https://mcp-gantt-lob-server.onrender.com
- `VITE_FRONTEND_FORGE_API_URL`
- `VITE_ANALYTICS_ENDPOINT`

---

## Skills instalados no AionUi

**Total: 270 skills** (251 com SKILL.md + 19 diretórios de categoria)

### Skills de engenharia instalados em set/2026

**mattpocock/skills (10):**
- ask-matt, code-review, codebase-design, diagnosing-bugs, domain-modeling, implement, tdd, wizard, loop-me

**superpowers (9):**
- brainstorming, executing-plans, writing-plans, systematic-debugging, test-driven-development, subagent-driven-development, using-superpowers, writing-skills, verification-before-completion

**everything-claude-code (12):**
- backend-patterns, frontend-patterns, mcp-server-patterns, tdd-workflow, jira-integration, github-ops, nextjs-turbopack, database-migrations, e2e-testing, production-scheduling, production-audit, plan-canvas, strategic-compact

### Skills do ecossistema (existentes)

- sinapi-SEINFRA, gantt-chart, budget-variance-analyzer, cash-flow-forecaster, project-kpi-dashboard
- oce-scheduling-4d5d, daily-progress-report, cost-estimation-resource, weather-construction
- eap, plataforma-obras, construction-data-collection
- vercel-cli-with-tokens (oficial Vercel), deploy-to-vercel
- github, hermes-agent, kanban-workflow, custom-mcp-server-workflow, add-mcp, aionui-dev-setup
- agent-browser, agentcore, claude-code, codex, opencode, computer-use
- pdf, docx, xlsx, powerpoint, google-workspace, notion, maps
- meeting-action-items, weekly-review-planning, ecc-guide

---

## GitHub

**User:** ragomes102030-cpu
**Token:** <token-redacted> (scopes: admin:org, repo, workflow, write:packages, read:org)

**Repositórios (7):**
- plataforma-obras (principal)
- mcp-plataforma-obra
- mcp-gantt-lob-server
- mcp-cronograma-server
- mcp-eap-server
- AIONUICLONE
- mais 1

---

## Decisões tomadas

### Vercel vs Render (set/2026)
**Decisão:** Vercel para frontend.
**Motivo:** Edge Network, melhor performance para SPA, sem cold starts do Render free tier, integração nativa com GitHub.

### Aiven para banco de dados
**Decisão:** Aiven MySQL 8.
**Motivo:** Plano gratuito disponível, SSL obrigatório (bom para produção), PostGIS também disponível se precisar no futuro.

### pnpm como gerenciador de pacotes
**Decisão:** pnpm workspace monorepo.
**Motivo:** Já estava no projeto, économia de disco com content-addressable store.

### MCP servers como stdio vs sse vs http
**Observação:** Mistura de transportes. stdio para MCP servers locais (excel, whatsapp, lean-planning), SSE/HTTP para servidores remotos (cronograma, eap, gantt via Vercel).

---

## Melhorias feitas (set/2026)

### Migração Render → Vercel
- Removido Rewrite do verc.json p/ Render
- Atualizado vercel.json (sem BOM, sem Rewrite, framework: vite)
- Atualizado server/_core/env.ts (todas URLs → Vercel)
- Atualizado render.yaml (PUBLIC_APP_URL → Vercel)
- Atualizado github-oauth.test.ts (2 instâncias → Vercel)
- Atualizado mcp-server/src/index.ts e dist/index.js (URLs → Vercel)
- Atualizado MCP servers no SQLite (7 MCPs com URLs onrender.com → Vercel)
- Removidos bytes nulos de render.yaml (27 bytes)

### Instalação de skills
- +29 skills novos (mattpocock/skills, superpowers, everything-claude-code)
- ECC guide instalado via skills.sh

### Adição de MCPs
- +4 MCPs novos: autodesk-bim, linear, clickup, composio
- Composio configurado por variável de ambiente; nenhum token é armazenado no repositório

### Gateway
- Hermes gateway reiniciado (PID 31264)

---

## Como usar / comandos úteis

### Build e deploy
```bash
cd plataforma-obras
pnpm install
pnpm build           # build frontend + backend
vercel deploy --prod  # deploy no Vercel
```

### Banco de dados
```bash
pnpm db:push              # push do schema Drizzle
pnpm db:migrate:integrity # migração WBS
```

### Testes
```bash
pnpm test                   # vitest run
pnpm check                  # tsc --noEmit
pnpm e2e:fictitious         # teste e2e fictício
```

### Novos MCPs (precisam de tokens)
```
AUTODESK_TOKEN=...    # para autodesk-bim
LINEAR_TOKEN=...      # para linear
CLICKUP_TOKEN=...     # para clickup
```

Composio: configure `COMPOSIO_API_KEY` somente no ambiente de execução.

---

## Problemas conhecidos

| Problema | Status |
|---|---|
| MCPs sem tokens (autodesk/linear/clickup) | ⚠️ Aguardando tokens |
| lean-planning MCP aponta pro Desktop local | ⚠️ Depende máquina local ligada |
| `client/package.json` não existe (build usa root package.json) | ℹ️ Funcional mas confuso |
| gateway warning após update | ℹ️ Fazer `hermes gateway restart` após update |
| mcp-server usa URLs e tokens somente por variáveis de ambiente | ✅ Corrigido |

---

## Contatos / Acesso

- **AionUi:** rodando via ACP, Hermes Agent como orquestrador
- **Modelo atual:** upstage/solar-pro4:free via provider nous
- **Gerente de projetos:** Rafael Gomes (grafaelalexandre@gmail.com)
- **GitHub:** ragomes102030-cpu
