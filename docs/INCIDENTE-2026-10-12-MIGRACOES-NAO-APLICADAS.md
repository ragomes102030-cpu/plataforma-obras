# Incidente 12/10/2026 — migrações não aplicadas em produção

## O que aconteceu

O deploy `510da5b` (R6-02: CUB e BDI declarados) subiu e `projects.list`
passou a responder **HTTP 500**:

```
Failed query: select ... "cubValor", "cubUf", "cubMes", "bdiDeclarado" from "projects"
```

As colunas não existiam no banco. A migração `0012_project_cub_bdi_declarados.sql`
estava no repo e **nunca tinha sido aplicada em produção**. A tela de obras
seguia mostrando a lista (cache do cliente) enquanto a API estava fora.

## Causa raiz — dois defeitos somados

### 1. O `startCommand` do serviço usa `;` em vez de `&&`

O `render.yaml` do repo declara, com o comentário explicando por quê:

```
startCommand: node scripts/migrate-pg.mjs && node scripts/audit-schema-pg.mjs && pnpm start
```

O serviço no Render usa:

```
node scripts/migrate-pg.mjs; node scripts/audit-schema-pg.mjs; pnpm start
```

`;` **ignora o código de saída**. O `audit-schema-pg.mjs` detectou a divergência
em TODOS os deploys — e o `pnpm start` rodou mesmo assim. **O guard existe no
repo e está desarmado no serviço.** O comentário do yaml diz que o `&&` é seguro
porque o healthcheck é `/readyz` (o Render mantém o deploy anterior no ar), e é
verdade: com `&&` a falha seria contida.

### 2. `USE_SUPABASE=1` desativa o DDL do migrador

```
[migrate] USE_SUPABASE=1: DDL de startup desativado; conferindo sequences de identidade.
[migrate] banco normal: 10 migration(oes) aplicada(s), 3 pendente(s)
[migrate]   pendente 1790827200000   <- 0010
[migrate]   pendente 1790830800000   <- 0011
[migrate]   pendente 1790834400000   <- 0012
```

O migrador **lista** as pendentes e **não aplica nenhuma**. Migração nova nunca
chega ao banco por este caminho.

## O que já estava divergente antes deste incidente

| Migração | DDL no banco | Registro no journal |
|---|---|---|
| 0010_activity_duration_positive | existia | **ausente** |
| 0011_enum_component_type_servico | existia | **ausente** |
| 0012_project_cub_bdi_declarados | **ausente** | ausente |

Os próprios arquivos 0010 e 0011 documentam a origem: *"Ja existe no banco: foi
aplicado ... via Supabase, mas nunca teve arquivo neste repo"* e *"O quarto valor
existe no banco — entrou por SQL avulso, sem migration"*. É o padrão que produz a
divergência: **DDL aplicado à mão, fora do caminho versionado.**

## Correção aplicada

1. DDL de 0012 aplicado (as 4 colunas: `cubValor numeric(12,2)`,
   `cubUf varchar(2)`, `cubMes varchar(7)`, `bdiDeclarado numeric(8,6)`, todas
   nullable). `projects.list` voltou a **HTTP 200**.
2. Journal completado com 0010, 0011 e 0012 (hash de `readMigrationFiles`, o
   mesmo que o migrador usa). Agora: **13 linhas, 13 distintas, última = 0012**.
   O registro é verdadeiro — o DDL das três está no banco.

## O que FALTA corrigir (depende de acesso ao painel)

- **Trocar `;` por `&&` no `startCommand` do serviço** (Settings → Start Command,
  no dashboard). Enquanto isso não for feito, qualquer divergência futura entre
  repo e banco **sobe quebrada** em vez de falhar o deploy.
- **Decidir o caminho de migração em produção.** Com `USE_SUPABASE=1` o DDL de
  startup está desativado; sem um caminho alternativo versionado, toda migração
  nova fica invisível até alguém aplicar à mão — que é o defeito de origem.

## Lição

`readyz` verde e suíte verde não provam que o caminho do banco de produção
funciona: nenhum dos dois exercita o SELECT real contra o schema real. O merge
foi publicado sem verificar que a migração tinha rodado — e a única coisa que
pegou o defeito foi o 500 em produção.
