# Deploy — Render + Supabase

> **Documento normativo.** Última atualização: 24/10/2026 (commit `caa66f5`).

Este é o runbook de produção. O alvo é **um só**: o serviço `plataforma-obras-3`
no Render. A visão de stack está em [`STACK-ATUAL.md`](STACK-ATUAL.md).

Se algum documento ou tutorial mandar configurar outro host (DockHosting, Railway,
Vercel, Aiven), ele está desatualizado: esses hosts **não** fazem parte do
sistema. Se ainda estiverem respondendo, são sobra — e sobra que continua no ar
servindo código velho é pior do que sobra desligada.

## Identificação do serviço

| Item | Valor |
| --- | --- |
| Serviço | `srv-dbcd0gon74is7384ufag` |
| Nome | `plataforma-obras-3` |
| URL | `https://plataforma-obras-3.onrender.com` |
| Branch | `main` |
| Runtime | **Docker** (`./Dockerfile`, contexto `.`) |
| Plano | free, região Oregon, 1 instância |
| Health check | **`/readyz`** |
| Auto-deploy | `autoDeployTrigger = commit` (push na `main` dispara) |

## Como saber se o deploy que está no ar é o código novo

`/healthz` responde o commit que está rodando:

```bash
curl -s https://plataforma-obras-3.onrender.com/healthz
# {"ok":true,"service":"plataforma-obras-api","commit":"fcec955",
#  "commitSource":"RENDER_GIT_COMMIT","branch":"main",
#  "deployId":"dep-...","environment":"production","uptimeSeconds":142}
```

Compare com:

```bash
git rev-parse --short origin/main
```

Diferente = o deploy não valeu. Ponto. Não existe "deve estar subindo": ou o
`commit` é o do `main`, ou não é.

- **`commitSource`**: no Render é `RENDER_GIT_COMMIT`. Se vier
  `"nao-encontrado"`, o commit não foi informado (build local) e o valor é
  `"desconhecido"` — nunca `"local"`.
- **`environment`** deve ser `production`.
- **`uptimeSeconds`** baixo = container recém-trocado. É o sinal mais rápido de
  que um deploy aconteceu.

### Ler a divergência (diagnóstico)

| Sintoma | Significa | O que fazer |
| --- | --- | --- |
| `commit` velho, sem 502, sem restart por ~30 min | o Render recebeu o push e **não agendou** o build | ver `autoDeployTrigger` (deve ser `commit`) e disparar pela API (abaixo) |
| `commit` velho, com 502 intermitente e restart | o build quebrou; o container antigo voltou | ver os logs do build no painel |
| primeira visita do dia demora ~50 s | plano free hiberna após ~15 min ocioso | normal; não é deploy quebrado |

Coisas que enganam, aprendidas na prática:

- O webhook GitHub → Render responder **`200`** significa **"recebi"**, não
  **"vou construir"**. Já houve push com `200` e nenhum build.
- **Build leva alguns minutos.** Não concluir "não subiu" antes de o log do build
  terminar.
- Durante o rollout o Render devolve **502 por 1–3 min**: dois containers atrás do
  mesmo host enquanto troca. É normal.

### Disparar o deploy na mão

```bash
# pelo painel: Manual Deploy -> Deploy latest commit
# ou pela API:
curl -X POST "https://api.render.com/v1/services/srv-dbcd0gon74is7384ufag/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"commitId":"<sha completo>"}'
```

### `deploy-verify`: o deploy não passa mais calado

`.github/workflows/deploy-verify.yml` roda **depois de cada push na `main`**:

1. pergunta ao Render se já existe deploy para aquele SHA (`GET /deploys`);
2. se não existe, dispara um (`POST /deploys`);
3. vigia `/healthz` de 20 em 20 s por até ~27 min até o `commit` publicado bater
   com o SHA do push.

Se não bater, o workflow **falha** — de propósito. Um deploy silenciosamente
velho é pior que um deploy vermelho, porque o dono segue usando o sistema
achando que a correção entrou.

Secrets/vars necessários:

- `secrets.RENDER_API_KEY` — para disparar o deploy. Sem ele o job só vigia e
  avisa.
- `vars.RENDER_SERVICE_ID` — opcional; o padrão já é `srv-dbcd0gon74is7384ufag`.

Rodar na mão para conferir um commit específico:

```bash
gh workflow run deploy-verify.yml -f commit=<sha>
```

## Como a imagem sobe

O Render está configurado como **runtime Docker**: constrói `./Dockerfile` com
contexto `.`. É o `Dockerfile` que vale em produção.

```dockerfile
# resumo do que importa
RUN pnpm install --frozen-lockfile
RUN pnpm run build
CMD ["pnpm", "start"]
```

- Build: `pnpm install --frozen-lockfile` + `pnpm run build`
- Start: `npm start` → `node scripts/migrate-pg.mjs && node scripts/audit-schema-pg.mjs && NODE_ENV=production node dist/index.js`
- Porta: `PORT`, servidor em `0.0.0.0`

`nixpacks.toml` continua no repositório porque já houve um período em que a
plataforma construía por Nixpacks; hoje **não é o caminho de produção**. As
decisões dele estão travadas em `server/build-plan.test.ts` e continuam valendo
para build alternativo (o `Dockerfile` também instala via `pnpm`).

### Node 22

`package.json` declara `"engines": { "node": "22.x" }`. Sem `engines`, o builder
escolhe Node 18 e o build morre no Vite/`@tailwindcss/oxide`
(`Vite requires Node.js 20.19+ or 22.12+`). O primeiro comando do install é
`node scripts/check-node.mjs`, que falha na primeira linha dizendo a versão que
realmente chegou — antes isso só aparecia três minutos depois como erro obscuro.

`pnpm.onlyBuiltDependencies` (`esbuild`, `@tailwindcss/oxide`) existe pelo mesmo
motivo: o pnpm 10 bloqueia scripts de pós-instalação por padrão e o build perde
os binários nativos.

### A cadeia de boot mora em `scripts.start`

```
node scripts/migrate-pg.mjs && node scripts/audit-schema-pg.mjs && NODE_ENV=production node dist/index.js
```

### Por que os `&&` importam

O separador é `&&`, não `;`. Se a migração **ou** a auditoria falhar, o serviço
não sobe. Com `;` o pior cenário acontecia: a migração falhava, a auditoria era
pulada e respondia `0`, o serviço subia e a plataforma marcava o deploy como
saudável **com o banco divergente** (incidente de 12/10 — ver
`docs/INCIDENTE-2026-10-12-MIGRACOES-NAO-APLICADAS.md`).

O `&&` depende de o health check ser **`/readyz`**: `/healthz` responde `200` sem
consultar o banco, então um deploy com schema quebrado seria promovido como
saudável. `/readyz` consulta o banco (`SELECT 1`) e responde `503` quando ele
está inacessível, o que impede a promoção do deploy ruim.

> **Corrigido em 2026-10-21.** O serviço estava com health check em `/healthz`,
> que não toca no banco. Foi trocado para `/readyz` pela API do Render. Se algum
> dia voltar a `/healthz`, o `&&` perde metade do valor.

## Variáveis de ambiente (configuradas no Render, não no repositório)

Os valores **não** ficam aqui.

| Variável | Observação |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | segredo; o login GitHub falha em `createSessionToken` se faltar |
| `DATABASE_URL` | conexão principal |
| `USE_SUPABASE` | `1` — veja a seção abaixo |
| `SUPABASE_DB_URL` | string de conexão usada quando `USE_SUPABASE=1` (usuário **read-only**) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth |
| `PUBLIC_APP_URL` | `https://plataforma-obras-3.onrender.com` |
| `AI_API_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | provedor de IA |
| `LLM_PRIMARY_*` / `LLM_FALLBACK_*` / `LLM_SECONDARY_*` | cadeia de LLMs |
| `LLM_MAX_ATTEMPTS` | `3` |
| `LLM_REQUEST_TIMEOUT_MS` | `45000` |
| `MCP_EAP_URL` / `MCP_CRONOGRAMA_URL` / `MCP_GANTT_LOB_URL` | servidores MCP |
| `MCP_REQUEST_TIMEOUT_MS` | `60000` |

`PUBLIC_APP_URL` **tem** de ser a URL do Render. Se apontar para o DockHosting,
o link de login volta para um host que está servindo código velho.

## `USE_SUPABASE=1` — o que ele desliga

Com `USE_SUPABASE=1` o usuário da aplicação (`arquimedes_app`) **não é dono** das
tabelas e **não pode rodar DDL** (`aclchk_error`). Por isso o `migrate-pg.mjs`
**não aplica migrações** nesse modo: ele apenas sincroniza sequences de
identidade e sai com `0`.

Consequência prática: **uma nova migração não é aplicada pelo deploy.** Ela
precisa ser aplicada manualmente no SQL Editor do Supabase, e o
`drizzle/meta/_journal.json` e o banco precisam continuar de acordo.

Isso deixou de ser um risco silencioso: a auditoria confere o **controle de
migrations**, comparando o `when` de cada entrada de `drizzle/meta/_journal.json`
com as linhas de `__drizzle_migrations`. Se existir migration no repositório que
o banco não registrou, a auditoria reprova e o container não sobe. A comparação é
por **timestamp**, não por contagem — o banco já teve 20 linhas para 10
migrations (duplicatas), e o total "batia" justamente quando faltava uma
migration de verdade.

### Aplicar uma migration como dono

Não existe credencial de dono na aplicação nem nas variáveis do Render. Quem
aplica DDL é **você**, no SQL Editor do Supabase (ou pela Management API).

```sql
-- cole o conteúdo de drizzle/00XX_*.sql
```

Depois registre a migration, senão a auditoria reprova (de novo, de propósito):

```sql
INSERT INTO public.__drizzle_migrations (hash, created_at)
SELECT '<hash>', <when_da_entrada_do_journal>;
```

O `created_at` **tem** de ser igual ao `when` da entrada em
`drizzle/meta/_journal.json`.

### Auditoria: o que reprova e o que só avisa

- **Reprova** (`exit 1`, o container não sobe): objeto **faltando** no banco
  (tabela, coluna, enum, trigger declarados nas migrações e ausentes no banco) e
  **migration pendente** (entrada no journal sem linha em `__drizzle_migrations`).
  Nesse caso a aplicação vai ler algo que não existe.
- **Avisa** (`AVISO (não fatal)`): objeto **a mais** no banco (por exemplo as
  tabelas de QA `qa_eap_activity_backup_*`). Tabela extra não quebra a aplicação,
  e um guarda permanentemente vermelho por causa disso foi o que fez a auditoria
  ser ignorada na última vez.

> **Ponto de atenção.** A cadeia `migrate && audit` roda a cada boot, e o plano
> free hiberna — ou seja, ela roda muitas vezes por dia. Com 1 instância isso é
> seguro; com réplicas haveria corrida entre duas migrações simultâneas. Se o
> serviço um dia passar a ter mais de uma instância, essa cadeia tem de sair do
> `start` e virar etapa de release.

## Checklist de "o sistema está de pé"

```bash
curl -s https://plataforma-obras-3.onrender.com/healthz   # ok:true + commit = main
curl -s https://plataforma-obras-3.onrender.com/readyz    # ok:true, tabelas:39, warnings:[]
```

`/readyz` é a prova de que a cadeia de boot inteira rodou: ele só responde `200`
se o banco responde e o schema foi migrado. `warnings` vazio é o esperado.
