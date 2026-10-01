# Setup e Configuração

Última atualização: 26/09/2026

---

## Pré-requisitos

- Node.js 22.x
- pnpm (npm install -g pnpm)
- Git
- Her Majesty's CLI (opcional, para gerenciar skills/MCPs)

### Instalar dependências

```bash
cd plataforma-obras
pnpm install
```

---

## Banco de dados

### Aiven MySQL

1. Crie conta em https://aiven.io
2. Crie serviço MySQL (grátis disponível)
3. Copie a CONNECTION STRING (ex: `mysql://avnadmin:***@...`)
4. Configure no `.env.local`:
   ```
   DATABASE_URL=mysql://avnadmin:***@mysql-1ca8c074-grafaelalexandre-fe80.f.aivencloud.com:27571/defaultdb?ssl-mode=REQUIRED
   ```
5. Roda o push do schema:
   ```bash
   pnpm db:push
   ```

### Estrutura de tabelas (Drizzle ORM)

Ver `server/db.ts` para schema. Principais tabelas:
- Projects (projetos de obra)
- Tasks (tarefas)
- WBS (Work Breakdown Structure)
- Costs (custos)
- Gantt items
- Dependencies (dependências de tarefas)

---

## Frontend (Vite + React)

### Variáveis de ambiente

Crie `.env.local`:
```env
VITE_API_URL=https://plataforma-obras-8uhqy3k5f-rafael-5864.vercel.app
VITE_ANALYTICS_ENDPOINT=...
```

### Build local

```bash
pnpm build
# Saída: dist/public/ (frontend) + dist/index.js (backend)
```

---

## Backend (Express + tRPC)

### Variáveis de ambiente

```env
DATABASE_URL=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
PUBLIC_APP_URL=https://plataforma-obras-8uhqy3k5f-rafael-5864.vercel.app
MCP_EAP_URL=https://mcp-eap-server.onrender.com
MCP_CRONOGRAMA_URL=https://mcp-cronograma-server.onrender.com
MCP_GANTT_LOB_URL=https://mcp-gantt-lob-server.onrender.com
```

### Rodar localmente

```bash
pnpm dev
# Inicia: NODE_ENV=development tsx watch server/_core/index.ts
```

### Build para produção

```bash
pnpm build
node dist/index.js
```

---

## Hospedagem no Vercel

### Configuração inicial

1. Instale Vercel CLI: `npm i -g vercel`
2. Faça login: `vercel login`
3. No diretório do projeto: `vercel`
4. Configure environment variables no dashboard

### vercel.json (já configurado)

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist/public",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": "vite"
}
```

### Deploy

```bash
vercel deploy --prod
# ou
git push  # auto-deploy via GitHub connected
```

---

## MCPs

### Configuração dos MCPs

Os MCPs ficam registrados no SQLite do AionUi:
`%APPDATA%\AionUi\aionui\aionui-backend.db` (tabela `mcp_servers`)

### Adicionar novo MCP

Via CLI Hermes ou diretamente no SQLite:

```sql
INSERT INTO mcp_servers (id, user_id, name, description, enabled, transport_type, transport_config, ...)
VALUES (...);
```

### MCPs já configurados

Ver `docs/README.md` → seção "MCPs configurados (30 habilitados)"

### Tokens necessários

| MCP | Token | Como obter |
|---|---|---|
| autodesk-bim | AUTODESK_TOKEN | https://developer.autodesk.com |
| linear | LINEAR_TOKEN | https://linear.app → Settings → API |
| clickup | CLICKUP_TOKEN | https://clickup.com → Settings → Apps |
| composio | COMPOSIO_API_KEY | https://composio.dev → API Keys |

Composio: configure `COMPOSIO_API_KEY` somente no ambiente de execução.

---

## Skills

### Adicionar skill no AionUi

Skills ficam em: `C:\Users\<user>\AppData\Local\hermes\skills\<skill-name>\SKILL.md`

AionUi auto-detection: basta colocar o SKILL.md na pasta.

### Instalar skill da skills.sh

```bash
hermes skills install <skill-name> --yes
```

### Skills já instalados

Ver `docs/README.md` → seção "Skills instalados no AionUi (270)"

---

## GitHub

### Token pessoal

```bash
gh auth login --with-token <<< "ghp_..."
```

Scopes necessários: `admin:org, repo, workflow, write:packages, read:org`

---

## AionUi configuração

### Configuração via config.yaml

Local: `C:\Users\<user>\.hermes\config.yaml`

```yaml
mcp_servers:
  aiven:
    url: "https://mcp.aiven.live/mcp"
    description: "PostgreSQL + Kafka - banco de dados obras"
    auth:
      type: "token"
  github:
    url: "https://mcp.github.com/mcp"
    description: "Repositorios, PRs, issues do projeto"
    auth:
      type: "token"
```

---

## Troubleshooting

### Build falha
```bash
rm -rf node_modules/.pnpm
pnpm install
pnpm build
```

### Banco não conecta
- Verifique DATABASE_URL em .env.local
- Verifique se Aiven está rodando
- Verifique SSL (REQUIRED)

### MCP não conecta
- Verifique token configurado
- Verifique se o MCP server está rodando
- Verifique URL no SQLite

### Vercel não deploya
- Verifique se vercel.json está correto
- Verifique se GH_TOKEN tem scopes suficientes
- Verifique logs no Vercel dashboard
