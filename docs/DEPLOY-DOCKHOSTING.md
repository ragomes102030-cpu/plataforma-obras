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

## Como saber se o deploy que esta no ar e o codigo novo

**Esta e a resposta para o incidente de 12/10.** O `/healthz` responde o commit
que esta rodando:

```bash
curl -s https://plataforma-obras.dockhosting.dev/healthz
# {"ok":true,"service":"plataforma-obras-api","commit":"93e33d6",
#  "commitSource":"SOURCE_COMMIT","branch":null,"deployId":null,
#  "environment":"production","uptimeSeconds":965,"tabelas":37}
```

Compare `commit` com:

```bash
git rev-parse --short origin/main
```

Diferente = o deploy nao valeu. Ponto.

- **`commitSource`** diz de onde o dado veio. Em producao e `SOURCE_COMMIT`, que
  e a variavel que o **DockHosting** injeta. Se vier `"nao-encontrado"`, o commit
  nao foi informado e o valor e `"desconhecido"` — nunca `"local"`.
- **`environment`** deve ser `production`.
- `uptimeSeconds` baixo = container recem-trocado. E o sinal mais rapido de que um
  deploy aconteceu.

### Ler a divergencia (diagnostico)

| Sintoma | Significa | O que fazer |
| --- | --- | --- |
| `commit` velho, **sem** 502 e **sem** restart por mais de ~30 min | a plataforma **nao agendou** o build (ela recebeu o push e parou ali) | disparar deploy manual no painel |
| `commit` velho, **com** 502 intermitente e restart | build quebrou; o container antigo voltou | ver os logs do build no painel |

Detalhes que enganam, aprendidos na pratica:

- O webhook GitHub -> DockHosting responder **`200 OK`** significa **"recebi"**,
  nao **"vou construir"**. Ja houve push com `200` e nenhum build por 47 min.
- **Build leva de 6 a 28 minutos.** Nao concluir "nao subiu" antes de ~30 min.
- Durante o rollout o gateway devolve **502 por 1-3 min**: dois containers atras do
  mesmo host enquanto troca. E normal.
- O container antigo continua servindo durante todo o build, e continua servindo
  se o build falhar. Por isso `uptime`/`commit` e a unica evidencia real.

### Webhooks

O repo tem varios webhooks do DockHosting (um por projeto criado). No push, **so
um** responde `200`; os orfaos respondem `401`. Para diagnosticar:

```bash
gh api repos/<owner>/<repo>/hooks
gh api "repos/<owner>/<repo>/hooks/<id>/deliveries?per_page=5"
```

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
