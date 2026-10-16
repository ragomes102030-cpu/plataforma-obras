# Deploy — DockHosting + Supabase

Este documento substitui o `render.yaml` (removido). A stack do projeto e
**GitHub + DockHosting + Supabase**. Render, Railway, Vercel e Aiven sairam do
projeto; qualquer arquivo de configuracao dessas plataformas deve ser tratado
como lixo, nao como fonte de verdade.

## Endereco publico

`https://plataforma-obras.dockhosting.dev/`

A fonte de verdade do endereco no repositorio e `server/_core/env.ts`
(`publicAppUrl`). O `scripts/verificar-deploy.mjs` e o
`server/verificar-deploy.test.ts` checam que os dois concordam — duas fontes de
verdade para o mesmo endereco, sem uma checando a outra, foi como o endereco
divergiu no passado.

## Como a imagem sobe

- Build: `Dockerfile` (o DockHosting constroi a imagem; nao existe mais nenhum
  blueprint de plataforma no repositorio).
- Start (`Dockerfile`, `CMD`):

  ```
  node scripts/migrate-pg.mjs && node scripts/audit-schema-pg.mjs && pnpm start
  ```

- Healthcheck: `/readyz`.

### Por que os `&&` importam

O separador e `&&`, nao `;`. Se a migracao **ou** a auditoria falhar, o servico
nao sobe. Com `;` o pior cenario acontecia: a migracao falhava, a auditoria era
pulada e respondia `0`, o servico subia e a plataforma marcava o deploy como
saudavel **com o banco divergente** (foi o incidente de 12/10 — ver
`docs/INCIDENTE-2026-10-12-MIGRACOES-NAO-APLICADAS.md`).

O `&&` depende de o healthcheck ser `/readyz`: `/healthz` responde `200` sem
consultar o banco, entao um deploy com schema quebrado seria promovido como
saudavel. `/readyz` consulta o banco (`SELECT 1`) e responde `503` quando ele
esta inacessivel, o que impede a promocao do deploy ruim.

## Variaveis de ambiente (configuradas no DockHosting, nao no repositorio)

Os nomes abaixo vieram do antigo `render.yaml`. Os valores **nao** ficam aqui.

| Variavel | Observacao |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | segredo; o login GitHub falha em `createSessionToken` se faltar |
| `DATABASE_URL` | conexao principal |
| `USE_SUPABASE` | `1` — veja a secao abaixo |
| `SUPABASE_DB_URL` | string de conexao usada quando `USE_SUPABASE=1` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth |
| `PUBLIC_APP_URL` | `https://plataforma-obras.dockhosting.dev` |
| `AI_API_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | provedor de IA |
| `LLM_PRIMARY_*` / `LLM_FALLBACK_*` / `LLM_SECONDARY_*` | cadeia de LLMs |
| `LLM_MAX_ATTEMPTS` | `3` |
| `LLM_REQUEST_TIMEOUT_MS` | `45000` |
| `MCP_EAP_URL` / `MCP_CRONOGRAMA_URL` / `MCP_GANTT_LOB_URL` | servidores MCP |
| `MCP_REQUEST_TIMEOUT_MS` | `60000` |

## `USE_SUPABASE=1` — o que ele desliga

Com `USE_SUPABASE=1` o usuario da aplicacao (`arquimedes_app`) nao e dono das
tabelas e nao pode rodar DDL. Por isso o `migrate-pg.mjs` **nao aplica
migracoes** nesse modo: ele apenas sincroniza sequences de identidade e sai com
`0`.

Consequencia pratica: uma nova migracao (por exemplo `0013`) **nao e aplicada
pelo deploy**. Ela precisa ser aplicada manualmente no SQL Editor do Supabase, e
o `drizzle/meta/_journal.json` e o banco precisam continuar de acordo. A
auditoria (`scripts/audit-schema-pg.mjs`) existe justamente para fazer essa
divergencia aparecer — por isso ela roda no start, separada da migracao.

### Auditoria: o que reprova e o que so avisa

- **Reprova** (`exit 1`, o container nao sobe): objeto **faltando** no banco
  (tabela, coluna, enum, trigger declarados nas migracoes e ausentes no banco).
  Nesse caso a aplicacao vai ler algo que nao existe.
- **Avisa** (`AVISO (nao fatal)`): objeto **a mais** no banco (por exemplo as
  tabelas de QA `qa_eap_activity_backup_*`). Tabela extra nao quebra a
  aplicacao, e um guardamento permanentemente vermelho por causa disso foi o que
  fez a auditoria ser ignorada na ultima vez.
