# Setup e Configuração

> **Documento normativo.** Última atualização: 24/10/2026 (commit `caa66f5`).

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
Render (`plataforma-obras-3`) e, em desenvolvimento, no `.env.local` (que é
ignorado pelo git).

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
PUBLIC_APP_URL=https://plataforma-obras-3.onrender.com
MCP_EAP_URL=https://mcp-eap-server-rafael-5864.vercel.app
MCP_CRONOGRAMA_URL=https://mcp-cronograma-server-rafael-5864.vercel.app
MCP_GANTT_LOB_URL=https://mcp-gantt-lob-server-rafael-5864.vercel.app
```

As três `MCP_*_URL` apontam para servidores MCP externos que continuam no ar e
não fazem parte do deploy principal. O resto da stack é só GitHub + Render +
Supabase (`docs/STACK-ATUAL.md`).

### Login com GitHub: o campo que trava tudo

O `redirect_uri` que o servidor envia ao GitHub sai de `PUBLIC_APP_URL`
(`server/_core/github-oauth.ts`, `getBaseUrl`), e o GitHub **recusa** qualquer
valor que não case com uma Callback URL cadastrada no app OAuth. A recusa
aparece como "url inválida" na tela de login, e ela NÃO é do Render nem do
código: é um campo na conta do GitHub.

O que precisa estar em **Settings → Developer settings → OAuth Apps**, na
página do app cujo `client_id` é o de `GITHUB_CLIENT_ID`:

```
https://plataforma-obras-3.onrender.com/api/auth/github/callback
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

## Hospedagem no Render

Produção é **um** serviço: `plataforma-obras-3` (`srv-dbcd0gon74is7384ufag`),
branch `main`, URL `https://plataforma-obras-3.onrender.com`. Detalhe completo em
`docs/DEPLOY.md`; aqui vai só o mínimo para recriar o serviço do zero.

### Configuração inicial

1. No painel do Render, **New → Web Service**, conecte o repositório
   `ragomes102030-cpu/plataforma-obras`, branch `main`
2. Runtime: **Docker**. Dockerfile path `./Dockerfile`, contexto `.`
3. Health check path: **`/readyz`** (não `/healthz`: `/readyz` consulta o banco)
4. Environment: as variáveis da seção acima; `PUBLIC_APP_URL` **tem** de ser a
   URL do Render
5. Auto-deploy: `commit` (push na `main` dispara build)

### O que o GitHub Actions faz (e o que não faz)

- `ci.yml` (pull request e push na `main`): instala, roda testes, valida tipos e
  faz o build. Não publica nada.
- `schema-audit.yml` (pull request): reprova a promoção quando o repositório tem
  migration que o banco não registrou.
- `deploy-verify.yml` (push na `main`): pergunta ao Render se já existe deploy do
  SHA, dispara um se não existir, e vigia o `/healthz` até o commit publicado
  bater. Falha quando não bate — é o guarda que impede deploy velho passar em
  silêncio.
- `aurora-eap-regression.yml`: regressão da EAP numa obra de teste.

Quem constrói e publica a imagem é o Render, ao receber o push.

### Build local (Docker, opcional)

O `Dockerfile` é **o mesmo** que a produção usa, então dá para reproduzir o build
localmente.

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
- `curl -s https://plataforma-obras-3.onrender.com/healthz` e compare o `commit`
  com o `git rev-parse --short HEAD`
- O `deploy-verify` do GitHub Actions acusa sozinho se em 45 min o commit não
  estiver publicado
- Build de 10 a 20 min é normal (Nixpacks baixa o nixpkgs a cada build)
