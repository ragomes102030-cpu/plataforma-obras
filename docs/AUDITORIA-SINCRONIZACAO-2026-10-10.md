# Auditoria de Sincronizacao GitHub -> Render -> Supabase

Data: 2026-10-10 | Branch: develop | Commit auditado: 9c7ff82
Escopo: fluxo de deploy, schema, historico de migracoes. Nenhuma alteracao
destrutiva foi executada. Banco apenas auditado (read-only).

---

## 1. Diagnostico confirmado

### D1 — As migracoes NAO sao aplicadas em producao  [CRITICO]

`scripts/migrate-pg.mjs:33`
```js
const supabaseOnly = process.env.USE_SUPABASE === "1";
```
`scripts/migrate-pg.mjs:221-225`
```js
if (supabaseOnly) {
  await sincronizarSequenciasDeIdentidade(conn);
  await conn.end();
  process.exit(0);          // sai ANTES de aplicarMigracoes (linha 260)
}
```
`render.yaml:22` define `USE_SUPABASE: "1"`.

Consequencia: nenhum `CREATE TABLE` / `CREATE TYPE` / `CREATE TRIGGER` de
`drizzle/*.sql` e executado. O boot so sincroniza sequences de identidade.

Evidencia: o enum `composition_components_componentType` tem 4 valores no banco
(`material,mao_de_obra,equipamento,servico`) enquanto `drizzle/0000_baseline.sql:56`
cria 3. O banco nao foi construido por esses arquivos.

### D2 — A auditoria de schema esta desligada  [CRITICO]

`scripts/audit-schema-pg.mjs:26-29`
```js
if (process.env.USE_SUPABASE === "1") {
  console.log("[audit] USE_SUPABASE=1: auditoria de startup desativada; ...");
  process.exit(0);
}
```
O passo `node scripts/audit-schema-pg.mjs` do `startCommand` nao audita nada em
producao e sempre retorna exit 0.

### D3 — Falhas de migracao/auditoria sao mascaradas  [CRITICO]

`render.yaml:9`
```yaml
startCommand: node scripts/migrate-pg.mjs; node scripts/audit-schema-pg.mjs; pnpm start
```
Separador `;` (nao `&&`): se a migracao falhar, o Render segue para a auditoria
(desligada) e sobe o servico. O exit code observado pelo Render e o do `pnpm start`.

Dupla mascara: falha de DDL + auditoria desativada = deploy verde com banco divergente.

### D4 — Dois historicos de migracao divergentes  [ALTO]

| Migracao | journal Drizzle | supabase_migrations | arquivo em drizzle/ |
|---|---|---|---|
| 0000_baseline | sim | sim (20261004102601) | sim |
| 0001_updated_at_trigger | sim | AUSENTE | sim |
| 0002_project_documents | sim | sim | sim |
| 0003_eap_structure | sim | sim | sim |
| 0004_capability_control | sim | sim | sim |
| 0005_eap_decomposition_basis | sim | sim | sim |
| 0006_plan_version_snapshots | sim | sim | sim |
| 0007_project_trash | sim | sim | sim |
| 0008_updated_at_new_tables | sim | AUSENTE | sim |
| 0009_project_tipo_obra | sim | sim | sim |
| activity_duration_positive | AUSENTE | sim (20261005180621) | AUSENTE |
| add_seinfra_insumos_catalog | AUSENTE | sim (20261006142203) | AUSENTE |

`activity_duration_positive` corresponde ao CHECK declarado em
`drizzle/schema.ts:459` (`check("schedule_activities_duration_positive", ...)`) e
presente no banco — mas nao existe arquivo em `drizzle/`.
`add_seinfra_insumos_catalog` explica a carga SEINFRA (11.828 insumos), aplicada
fora do versionamento.

### D5 — `__drizzle_migrations` com 20 registros e 10 distintos  [MEDIO]

Cada migracao registrada 2x. Suspeita (a confirmar por subagente): caminho
`isLegacy`/BASELINE em `scripts/migrate-pg.mjs:192-212` faz INSERT por migracao
sem verificar existencia previa.

### D6 — SQL de migracao defasado em relacao ao codigo  [MEDIO]

| Objeto | drizzle/*.sql | drizzle/schema.ts | Banco real | Veredito |
|---|---|---|---|---|
| enum composition_components_componentType | 3 valores (:56) | 4 valores (:130) | 4 valores | SQL defasado |
| CHECK schedule_activities_duration_positive | ausente | declarado (:459) | presente | SQL defasado |

---

## 2. Estado verificado (sem divergencia)

- Banco real: Supabase PostgreSQL 17.11.0, ref `tromrvfijbtihuilvnuk`,
  regiao sa-east-1, status ACTIVE_HEALTHY. E o unico banco em uso.
- 37 tabelas em `public` (reconciliado: information_schema = pg_class = /readyz).
- 32 enums, 25 triggers `trg_*_updated_at`, 101 indices, 1 check constraint, 1 sequence.
- Deploy: Render `plataforma-obras-api` (srv-dandr7jbc2fs73e2qobg), branch `develop`,
  autoDeploy por commit. Ultimo deploy = `9c7ff82`, status **live**.
- `/healthz` HTTP 200 (0,245s). `/readyz` = `{ok:true, database:"ok", tabelas:37}`.
- `/internal/qa/eap` sem token = HTTP 404 (comportamento correto).
- CI (`.github/workflows/ci.yml`): pnpm check + test + build em ubuntu-latest.
  NAO toca o banco. O workflow `aurora-eap-regression.yml` usa `SUPABASE_DB_URL`
  (secret) e roda em push para `develop`.

---

## 3. Dados preservados (verificado)

AURORA TESTE (projectId=7, OB-PUPOCN) — obra VALIDA:
- 207 nos WBS (3 raizes, 159 pacotes), 53 atividades, 64 dependencias
- 1 baseline ativa "Baseline AURORA TESTE v1" com 53 itens
- 1 versao de orcamento, 53 itens, total R$ 5.193.043,02
- 19 atividades criticas | 0 duracoes invalidas | 0 sem WBS | 0 sem earlyStart
  | 0 sem cpmCalculatedAt

ARQUIMEDES-QA (projectId=8) — obra VAZIA (0 WBS, 0 atividades), `deletedAt=null`.
O sistema distingue corretamente obra vazia de obra valida.

12 obras no banco, 4 soft-deleted, nenhuma removida nesta auditoria.

Qualidade de dados (nullables preenchiveis):
- `wbs_nodes.externalId` NULL: 318 | `schedule_activities.externalId` NULL: 67
- `schedule_dependencies.externalId` NULL: 155 | `schedule_activities.versionId` NULL: 7

---

## 4. Riscos por criticidade

| # | Risco | Criticidade |
|---|---|---|
| R1 | Migracao falha em silencio -> deploy verde com banco divergente | CRITICO |
| R2 | Auditoria desligada -> divergencia de schema nao detectada | CRITICO |
| R3 | Alteracao de schema no repo nao chega ao banco automaticamente | ALTO |
| R4 | Migracoes aplicadas fora do versionamento (Supabase MCP) sem arquivo | ALTO |
| R5 | Sem staging: nao ha onde testar migracao antes de producao | ALTO |
| R6 | Duplicidade em `__drizzle_migrations` mascara o que foi aplicado | MEDIO |
| R7 | SQL defasado em relacao a schema.ts induz a erro quem for reaplicar | MEDIO |
| R8 | RLS desativado em todas as 37 tabelas (sem politicas) | BAIXO* |
| R9 | `externalId`/`versionId` NULL em centenas de linhas | BAIXO |

*BAIXO hoje porque o acesso ao banco e feito pelo backend com service role; se
houver acesso direto pelo cliente (anon key), sobe para ALTO.

---

## 5. Plano de correcao proposto (NAO executado)

### C1 — Reativar a auditoria no boot  [CRITICO]
Em `scripts/audit-schema-pg.mjs`, remover o early-exit das linhas 26-29. A funcao
`runtimeDatabaseUrl()` (linha 34) ja sabe montar a URL do pooler Supabase, entao a
auditoria consegue conectar. Fazer a auditoria retornar exit code != 0 quando houver
divergencia critica.

### C2 — Impedir deploy verde com banco divergente  [CRITICO]
Duas opcoes, a decidir:
- (a) `startCommand` com `&&` entre migrate e audit — o deploy falha se qualquer
  etapa falhar. Simples, mas derruba a disponibilidade (o deploy anterior continua
  servindo, o Render nao promove o novo).
- (b) `/readyz` passa a reportar `ok:false` quando houver divergencia critica. O
  Render usa `healthCheckPath: /healthz` hoje — trocar para `/readyz` faz o Render
  detectar o problema e nao promover o deploy, preservando o anterior.
Recomendacao: (b) + `&&` no startCommand. Preserva disponibilidade e nao mascara erro.

### C3 — Versionar as migracoes que so existem no banco  [ALTO]
Criar `drizzle/0010_activity_duration_positive.sql` (o CHECK) e
`drizzle/0011_add_seinfra_insumos_catalog.sql`, com entradas no journal, refletindo
o estado real. NAO reescrever `0000_baseline.sql` (mudaria o hash de uma migracao ja
registrada). Para o enum, criar `0012_enum_component_type_servico.sql` com
`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'servico'` (idempotente).

### C4 — Corrigir a duplicidade em `__drizzle_migrations`  [MEDIO]
Adicionar guarda de idempotencia no caminho BASELINE (`migrate-pg.mjs:201-212`):
`ON CONFLICT` ou checagem previa por `created_at`. Limpar as 10 duplicatas
mantendo o menor `id` — operacao restrita a tabela de controle, sem tocar dados de
negocio.

### C5 — Fluxo de migracao confiavel  [ALTO]
1. Autorar migracao em `drizzle/NNNN_*.sql` + entrada no journal (fonte da verdade).
2. CI aplica as migracoes em banco efemero (Supabase branch ou Postgres em container)
   e roda os testes.
3. Aplicacao em producao por caminho explicito e rastreavel (Supabase
   `apply_migration`, que grava os statements e versiona), nunca por SQL avulso.
4. Verificacao pos-aplicacao: `pnpm db:audit` com exit code real.
5. Rollback documentado por migracao (migracao de reversao, nao edicao da existente).
6. Backups: Supabase PITR / snapshot antes de migracao destrutiva.

### C6 — Staging  [ALTO]
Nao existe ambiente de staging. Opcoes: Supabase branch (efemero, ja disponivel no
plano) ou segundo servico Render apontando para banco separado. Recomendacao:
Supabase branch para validar migracoes no CI.

---

## 6. Pendencias

- [ ] Confirmar causa exata da duplicidade em `__drizzle_migrations` (subagente em andamento)
- [ ] Confirmar se `supabase_migrations.schema_migrations` grava os statements SQL
- [ ] Bateria de testes (`pnpm check`, `pnpm test`, `pnpm build`) — subagente em andamento
- [ ] Aprovacao do usuario antes de executar C1-C6
