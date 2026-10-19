# drizzle/

## Por que `0001_planning.sql` existe separada do `0000_baseline.sql`

O migrator do Drizzle decide o que aplicar comparando **só** o `created_at`:

```js
// node_modules/drizzle-orm/pg-core/dialect.js
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) {
  for (const stmt of migration.sql) { await tx.execute(sql.raw(stmt)); }
  // ... registra em __drizzle_migrations
}
```

O banco de produção já registrou `0000_baseline` com `created_at = 1790603791243`.
Acrescentar DDL **dentro** do arquivo `0000_baseline.sql` não executa nada: a
migração já consta como aplicada e o Drizzle não a reexecuta. Sem uma entrada
nova no journal, `pending` vem vazio e o `preDeployCommand` passa verde sem
aplicar schema nenhum.

Foi exatamente isso que aconteceu com as ondas 0.2b e 0.4: ambas acrescentaram
DDL apenas ao `0000_baseline.sql` e nenhuma alteração de schema jamais chegaria
ao banco. O código passaria a ler `work_calendars`, `mustStartOn` e `freeFloat`
— colunas que não existiriam — e a aplicação quebraria em runtime com
`Table doesn't exist` / `Unknown column`, apesar de o pre-deploy estar verde e
os testes locais passarem.

## Regra para as próximas ondas

Mudança de schema → **sempre** um `NNNN_nome.sql` novo com entrada própria no
`meta/_journal.json` e `when` estritamente maior que o da entrada anterior.
Nunca editar um `.sql` que já foi aplicado.

`server/migrations.test.ts` trava esse erro em três testes do bloco
"DDL novo nao depende de migracao ja aplicada".

Toda entrega que traz DDL vem também com o **bloco de reporte** da seção
seguinte. Os dois testes acima garantem que o repo está coerente; nenhum deles
olha o banco — e foi entre o repo coerente e o banco desatualizado que a `0012`
quebrou a produção.

## Bloco de reporte obrigatório para migração

Toda migração entra no relatório da entrega com este bloco preenchido. Ele existe
porque as guardas do repo (journal, arquivos, testes) e a auditoria do banco
cobrem duas pontas que **não se falam**: em 12/10/2026 a `0012` estava no repo,
com journal e testes verdes, e **nunca tinha sido aplicada em produção** —
`projects.list` respondeu HTTP 500 por coluna inexistente. O commit estava certo;
o banco, não. Nenhuma guarda olhava para isso.

- **Precisa aplicar em produção?** SIM | NAO
- **O `audit-schema-pg.mjs` ENXERGA esta migração?** SIM | NAO |
  NAO VERIFICADO (sem acesso ao banco)
- **Arquivo e idempotência** — qual `NNNN_nome.sql`, e se o DDL é repetível
  (`ADD COLUMN IF NOT EXISTS`, coluna nullable, `CREATE TABLE IF NOT EXISTS`)
- **DDL exato** — tabela, colunas, tipos, nulabilidade. O que o banco vai
  receber, não a descrição do schema em TypeScript
- **Caminho versionado** — o `USE_SUPABASE=1` **desliga o DDL de startup** do
  migrador (`scripts/migrate-pg.mjs` — ele lista as pendentes e não aplica
  nenhuma), e é por isso que a migração precisa ser aplicada à mão. O `start` do
  serviço **já usa `&&`** (corrigido em 12/10, hoje em `scripts.start` do
  `package.json`): com o audit enxergando
  as colunas, migração não aplicada **BARRA o deploy**. O `&&` não aplica a
  migração — só impede o deploy ruim. Se precisa aplicar, diga por qual caminho
  (SQL avulso no banco)
- **Verificação pós-apply** — a consulta em `information_schema` que prova que a
  coluna existe, com o resultado observado (`select column_name, data_type,
  is_nullable from information_schema.columns where table_name = '<tabela>'`)
- **Falha esperada se NÃO aplicar** — qual query quebra e com qual erro (ex.:
  `Failed query: select ... 'cubValor','cubUf','cubMes','bdiDeclarado' from
  'projects'`), para o sintoma ser reconhecível de imediato
- **Rollback** — o que desfaz (o `DROP COLUMN` correspondente) e se perde dado
- **Depois de aplicar** — registrar o `when` também no journal **do banco**
  (`__drizzle_migrations`), porque é ele — não o `meta/_journal.json` — que o
  `readMigrationFiles`/`ultimaRegistrada()` compara para decidir o que está
  pendente

### O sistema medido nos dois estados

Medição do lead em 12/10, rodando o fluxo inteiro com uma migração nova **não
aplicada**. Não é reproduzível sem acesso ao banco — por isso ela vai aqui
**atribuída**, não como se eu a tivesse rodado:

    migrate-pg.mjs (USE_SUPABASE=1) -> "13 aplicada(s), 1 pendente(s)", exit 0
    audit-schema-pg.mjs            -> "colunas: 1 ausente(s) / DIVERGENCIA: projects.colunaNova"
    com &&: pnpm start NAO RODA    -> DEPLOY FALHA

O que ela prova — e é o ponto desta seção: **nenhuma das duas guardas bastava
sozinha**. O `&&` sem o audit consertado não barra nada, porque o audit era cego
(dizia "banco confere" com a coluna faltando e saía com 0). O audit consertado sem
o `&&` também não, porque o `;` ignorava o código de saída. O incidente de 12/10
aconteceu com os dois defeitos juntos; a proteção só passa a existir com os dois
corrigidos. E o `&&` **não aplica** a migração: ele só impede o deploy ruim — quem
aplica é o SQL avulso.

### Exemplo preenchido — a `0012`

- **Precisa aplicar em produção?** SIM — e foi isso que falhou: foi aplicada à mão
  só depois de `projects.list` responder HTTP 500.
- **o audit ENXERGA esta migração?** SIM. Lendo o audit pelo próprio parser
  (`colunasPorTabela`), as quatro colunas aparecem em `projects`:
  `cubValor`, `cubUf`, `cubMes`, `bdiDeclarado` →
  `veredito: 4/4 colunas da 0012 visiveis ao audit`.
- **O que esse SIM diz e o que ele não diz:** ele diz que o guard **vê** estas
  colunas no repo — antes do `69c000c` ele não via. Ele **não** diz que o banco
  tem as colunas: quem diz isso é a conferência em `information_schema`. Sem
  banco, o audit roda e sai 1 (`nada a auditar`), e o campo vira
  `NAO VERIFICADO (sem acesso ao banco)`.

### Regras do campo "o audit enxerga esta migração?"

- **Nunca escreva SIM sem ter rodado.** Rode `node scripts/audit-schema-pg.mjs` e
  confirme que as colunas novas aparecem na saída. O campo é medição, não opinião.
- **Sem acesso ao banco, escreva `NAO VERIFICADO (sem acesso ao banco)`.** Sem
  string de conexão o audit sai com código 1 e não confere nada; "não rodou" nunca
  é "está ok".
- **Se ele não listar as colunas novas, o guard está cego para elas** — e isso é
  entrega parada, não detalhe: foi assim que `cubValor`, `cubUf`, `cubMes` e
  `bdiDeclarado` ficaram invisíveis. O regex de `ALTER TABLE` exigia a aspa antes
  do `ONLY` e por isso **nunca casou**, em nenhuma migração; no histórico inteiro
  eram 7 `ADD COLUMN` invisíveis (`deletedAt`, `deletedAtBy`, `tipoDeObra`,
  `cubValor`, `cubUf`, `cubMes`, `bdiDeclarado`) — o audit dizia "banco confere"
  com as colunas faltando e saía com 0. Corrigido em `69c000c`.

Duas lições que valem para quem escreve verificador:

- **Um verificador que nunca falha não é um verificador.** O audit era
  fail-closed no que enxergava (sem conexão, sai 1) e fail-open justamente na
  pergunta que importava (a coluna existir).
- **Teste que reimplementa a lógica não testa o código.** O teste do parser
  reimplementava o regex — corretamente — enquanto o de produção estava quebrado:
  testava uma cópia correta de um código quebrado. O teste que falta agora importa
  `colunasPorTabela` de verdade e exige que toda coluna de `ALTER TABLE` apareça.

## Conteúdo de `0001_planning.sql`

Tudo que o diff `b5517bf..HEAD` acrescentou ao baseline e nunca chegaria ao banco:

- `schedule_activities.mustStartOn`, `.finishNoLaterThan` (Onda 0.4)
- `schedule_activities.freeFloat` (Onda 0.4)
- tabelas `work_calendars` e `calendar_exceptions`, com FKs e índices (Onda 0.2b)

## Nota sobre comentários nos `.sql`

Os arquivos **podem** ter comentário no topo, e vários têm: `0000`, `0001`,
`0010`, `0011` e `0012` abrem com uma linha explicando o que a migração faz
(`0012`, por exemplo, cita valor/UF/mês no cabeçalho).

O caminho de execução é o `readMigrationFiles` do Drizzle, que fatia o arquivo em
`--> statement-breakpoint` — e só isso: **não** remove comentário. O comentário
viaja colado ao primeiro statement, e `-- linha` antes do DDL é SQL válido, então
não atrapalha. Nos testes, quem lê SQL para conferir sintaxe já corta comentário
de linha antes (`sqlSemComentarios`, `server/migrations.test.ts`) — e faz isso por
um motivo que confirma o de cima: "os próprios cabeçalhos das migrations citam a
sintaxe que foi evitada", e um teste que não distingue o que o banco lê do que o
humano escreveu ensina a não explicar.

Esta nota dizia antes que os arquivos eram "DDL puro, sem comentários no topo".
Não é o que os arquivos mostram, e nada depende disso: a regra que importa é a de
acima — `NNNN_nome.sql` novo, entrada própria no journal, `when` estritamente
maior, nunca editar um `.sql` já aplicado. Quem trava isso é
`server/migrations.test.ts`, bloco "DDL novo nao depende de migracao ja aplicada".
