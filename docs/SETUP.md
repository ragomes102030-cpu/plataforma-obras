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

### PostgreSQL (Supabase)

O banco é um PostgreSQL gerenciado no Supabase (ver `docs/STACK-ATUAL.md`).

1. Pegue a connection string no painel do Supabase (Project → Database →
   Connection string; use a porta `5432`, não o pooler `6543`, para rodar migração)
2. Configure no `.env.local`:
   ```
   DATABASE_URL=postgresql://USUARIO:SENHA@host:5432/postgres
   ```
3. Aplique o schema:
   ```bash
   node scripts/migrate-pg.mjs
   node scripts/audit-schema-pg.mjs
   ```

O `audit` confere o banco contra as migrations: contagens de tabelas, enums,
triggers e índices, e o journal. Ele roda no boot do deploy e imprime
`banco confere com as migracoes` quando está de acordo.

**A URL do banco não pertence a este arquivo.** Endereço de serviço sai do README
e a senha nunca entra no repositório — ela vive nas variáveis de ambiente do
DockHosting e, em desenvolvimento, no `.env.local` (que é ignorado pelo git).

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
# Front e API no mesmo domínio: em dev o Vite faz proxy de /api para o Express.
VITE_API_URL=http://localhost:3000
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
# Front, back e banco debaixo do mesmo domínio.
PUBLIC_APP_URL=https://plataforma-obras.dockhosting.dev
MCP_EAP_URL=https://mcp-eap-server-rafael-5864.vercel.app
MCP_CRONOGRAMA_URL=https://mcp-cronograma-server-rafael-5864.vercel.app
MCP_GANTT_LOB_URL=https://mcp-gantt-lob-server-rafael-5864.vercel.app
```

As três `MCP_*_URL` apontam para servidores MCP externos que continuam no ar e
não fazem parte do deploy principal. O resto da stack é só GitHub + DockHosting +
Supabase (`docs/STACK-ATUAL.md`).

### Login com GitHub: o campo que trava tudo

O `redirect_uri` que o servidor envia ao GitHub sai de `PUBLIC_APP_URL`
(`server/_core/github-oauth.ts`, `getBaseUrl`), e o GitHub **recusa** qualquer
valor que não case com uma Callback URL cadastrada no app OAuth. A recusa
aparece como "url inválida" na tela de login, e ela NÃO é do DockHosting nem do
código: é um campo na conta do GitHub.

O que precisa estar em **Settings → Developer settings → OAuth Apps**, na
página do app cujo `client_id` é o de `GITHUB_CLIENT_ID`:

```
https://plataforma-obras.dockhosting.dev/api/auth/github/callback
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

## Hospedagem no DockHosting

### Configuração inicial

1. Crie uma aplicação no painel do DockHosting e conecte o repositório
   `ragomes102030-cpu/plataforma-obras`, branch `main`
2. **Não** escolha Build Pack: o build é do Nixpacks e lê o `nixpacks.toml` do
   repositório (Node 22 + `pnpm install --frozen-lockfile` + `pnpm run build`)
3. Start Command: `npm start` (roda `migrate` → `audit` → `node dist/index.js`)
4. Environment: as variáveis da seção acima
5. O domínio de produção é `https://plataforma-obras.dockhosting.dev`

### O que o GitHub Actions faz (e o que não faz)

`.github/workflows/deploy-dockhosting.yml` roda em pull request e push:

1. **Checkout** do código
2. **Instalação** com pnpm 10.4.1
3. **Testes**, validação de tipos e build

Ele **não** publica nada e **não** empurra imagem para o Docker Hub. Quem constrói
e publica é o DockHosting, ao receber o push via webhook. Quem confere se o commit
que está no ar é o da `main` é o `deploy-verify.yml`, que compara o `commit` do
`/healthz` com o SHA e falha em 45 minutos se não bater.

### Build local (Docker, opcional)

O `Dockerfile` do repositório é útil para rodar local, mas **não** é o que a
produção usa (ver `docs/DEPLOY-DOCKHOSTING.md`).

```bash
# Build da imagem
docker build -t plataforma-obras .

# Run local
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e PUBLIC_APP_URL=http://localhost:3000 \
  plataforma-obras
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
- Verifique `DATABASE_URL` em `.env.local` (porta `5432`, não o pooler `6543`)
- Confira o status do projeto no painel do Supabase
- `node scripts/audit-schema-pg.mjs` diz exatamente o que está faltando

### MCP não conecta
- Verifique token configurado
- Verifique se o MCP server está rodando
- Verifique URL no SQLite

### Deploy não publica o commit
- `curl -s https://plataforma-obras.dockhosting.dev/healthz` e compare o `commit`
  com o `git rev-parse --short HEAD`
- O `deploy-verify` do GitHub Actions acusa sozinho se em 45 min o commit não
  estiver publicado
- Build de 10 a 20 min é normal (Nixpacks baixa o nixpkgs a cada build)
