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

### PostgreSQL

O Render só oferece PostgreSQL como banco gerenciado, e é onde o sistema roda.

1. Crie o PostgreSQL na mesma conta do serviço web
2. Copie a **Internal Database URL** da pagina do banco
3. Configure no `.env.local`:
   ```
   DATABASE_URL=postgresql://USUARIO:SENHA@host-interno:5432/nome
   ```
4. Aplique o schema:
   ```bash
   node scripts/migrate-pg.mjs
   node scripts/audit-schema-pg.mjs
   ```

O `audit` confere o banco contra as migrations: contagens de tabelas, enums,
triggers e índices, e o journal. Ele roda no boot do deploy e imprime
`banco confere com as migracoes` quando está de acordo.

**A URL do banco não pertence a este arquivo.** Este guia usava trazer a
connection string inteira, com host, porta e usuário de um Aiven que foi
abandonado; com o repositório público, endereço de serviço sai do README e a
senha nunca entra nele.

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
# Front, back e banco na MESMA conta. Uma moradia, um domínio.
PUBLIC_APP_URL=https://plataforma-obras-api.onrender.com
MCP_EAP_URL=https://mcp-eap-server-rafael-5864.vercel.app
MCP_CRONOGRAMA_URL=https://mcp-cronograma-server-rafael-5864.vercel.app
MCP_GANTT_LOB_URL=https://mcp-gantt-lob-server-rafael-5864.vercel.app
```

### Login com GitHub: o campo que trava tudo

O `redirect_uri` que o servidor envia ao GitHub sai de `PUBLIC_APP_URL`
(`server/_core/github-oauth.ts`, `getBaseUrl`), e o GitHub **recusa** qualquer
valor que não case com uma Callback URL cadastrada no app OAuth. A recusa
aparece como "url inválida" na tela de login, e ela NÃO é do Render nem do
código: é um campo na conta do GitHub.

O que precisa estar em **Settings → Developer settings → OAuth Apps**, na
página do app cujo `client_id` é o de `GITHUB_CLIENT_ID`:

```
https://plataforma-obras-api.onrender.com/api/auth/github/callback
```

Para desenvolvimento local, o mesmo servidor serve back e front, então a
Callback URL local é a mesma acrescida de `localhost`:

```
http://localhost:3000/api/auth/github/callback
```

**Um erro que custa tempo:** o GitHub **não** compara a URL inteira quando
"wildcard matching" está ligado — compara o host, a porta, e exige que o
caminho da `redirect_uri` seja um subdiretório do caminho cadastrado. Trocar o
domínio sem trocar o caminho (ou vice-versa) faz a URL passar a não casar sem
nenhum aviso do lado do GitHub. E trocar o domínio *e* o caminho exige editar a
Callback URL lá, porque o `redirect_uri` é derivado do código e não de
variável nenhuma.

**A ordem importa, e ela é invisível:** se o `PUBLIC_APP_URL` estiver errado, o
servidor pede ao GitHub um retorno num host de terceiro, e o GitHub recusa antes
de qualquer credencial ser conferida. Por isso, quando o login falhar, cheque
*neste* ordem: `PUBLIC_APP_URL` → Callback URL no GitHub → `GITHUB_CLIENT_ID`
→ `GITHUB_CLIENT_SECRET`.

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

Composio: a chave vive na página de API Keys da Composio, nunca neste arquivo.

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
