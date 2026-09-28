# drizzle/

## Por que `0001_planning.sql` existe separada do `0000_baseline.sql`

O migrator do Drizzle decide o que aplicar comparando **só** o `created_at`:

```js
// node_modules/drizzle-orm/mysql-core/dialect.js
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

## Conteúdo de `0001_planning.sql`

Tudo que o diff `b5517bf..HEAD` acrescentou ao baseline e nunca chegaria ao banco:

- `schedule_activities.mustStartOn`, `.finishNoLaterThan` (Onda 0.4)
- `schedule_activities.freeFloat` (Onda 0.4)
- tabelas `work_calendars` e `calendar_exceptions`, com FKs e índices (Onda 0.2b)

## Nota sobre comentários nos `.sql`

Os arquivos de migração aqui são DDL puro, sem comentários no topo. O Drizzle
fatia o arquivo em statements por `--> statement-breakpoint`, então um comentário
no topo acabaria colado ao primeiro statement — o `0000_baseline.sql` que roda
em produção é DDL puro por esse motivo. A justificativa fica neste README e nos
comentários de `server/migrations.test.ts`.
