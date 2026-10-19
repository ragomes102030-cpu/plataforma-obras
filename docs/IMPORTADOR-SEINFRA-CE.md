# Importador em lote — Catálogo SEINFRA-CE

Script **standalone** que carrega o catálogo SEINFRA-CE (insumos, serviços e composições)
nas tabelas de preço do plataforma-obras.

- Arquivo: `scripts/importar-seinfra-catalogo.mts`
- Execução: `npx tsx scripts/importar-seinfra-catalogo.mts [opções]`
- Branches: `fix/P2-importador-seinfra` (script + doc, base `dcc8626`) · `fix/fase3-composicoes-servico`
  (espelho dos `C…` + `--catalog-id`) · `fix/fase3-doc-pendencia-89` · `fix/seinfra-remove-supabase-morto`
  (remoção do caminho Supabase morto — ver §7 item 5)
- **Status: dry-run, `--print-sql` e typecheck já feitos; a execução contra banco nunca foi feita
  por esta branch.** O catálogo de produção foi carregado por outro caminho (ver §6).

## 1. Por que é standalone

O script **não** importa `server/db`, **não** lê `DATABASE_URL` implicitamente e **não** passa
pelo runtime do app. O DSN de destino só entra por `--database-url` ou
`--database-url-env <VAR>` nomeada, e apenas junto de `--execute`. Isso é deliberado: um
importador de catálogo não pode ter como efeito colateral descobrir credencial de produção
no ambiente.

## 2. Entradas (arquivos oficiais, três, não intercambiáveis)

| Arquivo | Papel | Destino |
| --- | --- | --- |
| Tabela de Insumos | insumos `I…`, `G…` | `price_items` |
| Planos de Serviços | serviços `C…` com descrição/unidade | `service_compositions` |
| Composições | relatório com um bloco por serviço | `composition_components` |

Um componente `C…` (composição dentro de composição) entra como
`componentType = 'servico'` e, se ainda não existir como item, ganha um **`price_items`
espelho** (`itemType = 'servico'`) — `composition_components.priceItemId` é `NOT NULL` e
referencia `price_items(id)`. Ver §5.2.

Os parsers vêm de `shared/price-sources/seinfra.ts` (já versionado). O arquivo de Composições
tem layout de **bloco**, não de tabela — o parser de blocos vive no próprio script
(`parseComposicoesSeinfraRows`) porque não é reutilizável pelo adapter de importação unitária.

## 3. Comandos

```powershell
# 1) simulação completa (padrão: dry-run, nada é escrito)
npx tsx scripts/importar-seinfra-catalogo.mts `
  --insumos      "…\Tabela-de-Insumos-028.1---ENC.-SOCIAIS-84,44.xls" `
  --planos       "…\Planos-de-Servicos-028.1---ENC.-SOCIAIS-84,44.xls" `
  --composicoes  "…\Composicoes-028---ENC.-SOCIAIS-114,15 (1).xls" `
  --reference 028.1 --also-import-services-as-items `
  --json out/relatorio-seinfra-dryrun.json

# 2) revisar o SQL que seria executado (não conecta em nada)
npx tsx scripts/importar-seinfra-catalogo.mts --insumos "…" --planos "…" --composicoes "…" --print-sql

# 3) gravação real (só depois de ensaiar num banco de ensaio — ver §6)
npx tsx scripts/importar-seinfra-catalogo.mts `
  --insumos "…" --planos "…" --composicoes "…" `
  --reference 028.1 --also-import-services-as-items `
  --execute --database-url-env SEINFRA_REHEARSAL_DSN --user-id <id> --verbose

# 4) completar um catálogo JÁ importado (não cria outro catálogo)
#    sem --catalog-id todo --execute insere um NOVO price_catalogs e duplica os itens
npx tsx scripts/importar-seinfra-catalogo.mts `
  --insumos "…" --planos "…" --composicoes "…" `
  --reference 028.1 --catalog-id <id-do-catalogo-existente> `
  --execute --database-url-env SEINFRA_PROD_DSN --user-id <id> --allow-production
```

`--help` lista todas as opções.

## 4. Salvaguardas de escrita

- **dry-run é o padrão.** Só `--execute` libera escrita.
- `--execute` exige DSN **e** `--user-id` (senão sai com código 3).
- DSN de produção conhecida (`…tromrvfijbtihuilvnuk…`) é **recusada**
  (código 4) mesmo com `--execute`; exige `--allow-production` explícito.
- O host é impresso **sem senha** (`usuario:***@host:porta/banco`).
- Tudo em **uma transação**: `BEGIN` … `COMMIT`, com `ROLLBACK` em qualquer erro.
- `--database-url`/`--database-url-env` sem `--execute` não são sequer lidos.
- `--catalog-id <id>` reusa um `price_catalogs` existente em vez de inserir outro. O id é
  conferido **antes de qualquer escrita**: precisa existir, ter `sourceType = 'SEINFRA'` e casar
  com a UF e a referência dos argumentos — senão o script aborta sem ter gravado nada. Sem essa
  opção, todo `--execute` cria um catálogo novo (é o que evita duplicar um catálogo já carregado).

## 5. Resultado do dry-run — 028.1 / ENC. SOCIAIS (84,44)

Medido em 2026-10-09, sem nenhuma escrita. Comando: o do §3 **sem**
`--also-import-services-as-items` (é assim que o catálogo de produção está: só insumos em
`price_items`).

| Destino | Linhas | Observação |
| --- | --- | --- |
| `price_catalogs` | 1 | `referencePeriod = 028.1`, `state = CE` |
| `price_items` | 12 077 | 11 828 insumos + 249 espelhos de composição (§5.2) |
| `service_compositions` | 4 436 | código é único na tabela |
| `composition_components` | 23 281 lidas | 23 266 graváveis = 21 104 material/MO/equipamento + 2 162 `servico` |

Com `--also-import-services-as-items` os 4 436 serviços também viram item: `price_items` = 16 264
e **nenhum espelho é preciso** (os `C…` já existem como item; o script reporta
`itensEspelhoJaExistiam`). As demais contagens não mudam.

Avisos do dry-run:

- **88 linhas ignoradas** do arquivo de Insumos — conferidas uma a uma: são banners de seção
  (`COTAÇÃO / …`) e re-execuções do cabeçalho (`Insumo | Descrição | Valor (R$)`).
  **Nenhum insumo real é perdido.**
- **1 código repetido** nos Planos de Serviços: `C2721`, com descrição, unidade e preço
  idênticos. O script deduplica e reporta (o `ON CONFLICT` não aceita chave duplicada
  no mesmo `INSERT`).
- **4 composições sem serviço correspondente** no arquivo de Planos: `C0734`, `C3913`,
  `C3914`, `C2132`. Divergência **entre os arquivos oficiais**, não falha de parsing
  (`C3913`/`C3914` = "RECICLADORA A FRIO"). Os **15 componentes** dessas 4 composições não têm a
  que serviço se amarrar e não são gravados — daí `compositionComponents: 23281` **e**
  `compositionComponentsPrevistos: 23266`.
- **0 órfãos** e **0 truncamentos** de descrição/unidade: todo componente `I…`/`G…` achou seu
  item e todo `C…` achou seu espelho. A checagem de órfãos foi validada ao rodar com `--limit`
  (aí sim acusa milhares) — ou seja, não é uma verificação vazia.

### 5.1 As composições sem componente: 248 → 89

O catálogo de produção tem **248** composições sem nenhum componente. O espelho dos `C…` derruba
para **89** — e o dry-run **reproduz os 248 exatos** antes da correção, o que valida o parser:

| Parcela | Quantas | Situação |
| --- | --- | --- |
| Blocos cujos componentes são **todos** `C…` | 159 | **resolvido**: entram como `servico` |
| Serviços **sem bloco nenhum** no arquivo de Composições | 89 | **não resolvido**: não há de onde tirar componente |
| Total | **248** | → **89** |

Os 89 (ex.: `C1622`, `C2716`, `C2717`, `C1605`…) são lacuna **do arquivo de origem**: o `Planos de
Serviços` lista o serviço, mas o `Composições` não traz bloco para ele. Nenhum espelho resolve —
só outra fonte de dados, ou aceitar os 89 como pendência declarada.

### 5.2 `price_items` espelho (`itemType = 'servico'`)

`composition_components.priceItemId` é `NOT NULL` e referencia `price_items(id)`. Como os `C…` só
existem em `service_compositions`, o componente de serviço não teria para onde apontar. Daí o
espelho:

- **1 espelho por código distinto** usado como componente: **249** códigos — não confundir com as
  **2 162 linhas** de componente `C…` (o mesmo sub-serviço se repete em vários blocos).
- Preço: `valorGeral` do próprio bloco de composição (custo unitário do serviço) e, na falta dele,
  o snapshot que o bloco pai pagou por unidade; último recurso, `0`.
- `temTrilha = false`, `notes = null` — espelho não veio de planilha de insumo.
- 7 dos 249 (`C1603`, `C1604`, `C1605`, `C1606`, `C1609`, `C1616`, `C2717`) são referenciados como
  componente mas não têm bloco no arquivo: descrição/unidade vêm da própria linha do componente.
  São justamente parte dos 89 que não zeram.
- **Identificação posterior — limitação declarada:** no banco o espelho é **indistinguível** de um
  serviço importado de verdade, porque nos dois casos `itemType = 'servico'`. Dos 249, **242 têm
  bloco** no arquivo (logo, linha em `service_compositions`) e só os **7 sem bloco** são
  identificáveis (ausentes de `service_compositions`). Consequência: não dá para separar depois
  "item que é composição" de "item que é serviço" só pelo banco. Por isso o **relatório do dry-run
  (`--json`) traz a lista completa em `itensEspelho`** — guarde esse arquivo se o import for
  executado.

### Trilha da EAP

O parser extrai a trilha hierárquica (`item 1.1.1 | CAPÍTULO > SUBGRUPO`) e a grava em
`notes`. **`service_compositions` não tem coluna de notas**, então a trilha dos serviços só é
persistida com `--also-import-services-as-items`, que grava os mesmos serviços também em
`price_items` (onde `notes` existe). Sem essa flag, o script **avisa** que a trilha será
perdida.

## 6. Antes de executar de verdade

O caminho de escrita **nunca foi executado a partir desta branch** (a tarefa proibia rodar contra
produção), então ele está verificado por revisão + typecheck + `--print-sql`. O catálogo de
produção **já existe** (carregado por outro caminho — commit `70d0254`, via API do Supabase); por
isso um novo `--execute` é um **complemento**, e **sem `--catalog-id` ele insere um segundo
`price_catalogs` com 11 828 itens duplicados**. Ordem recomendada:

1. Ensaiar num banco de ensaio com o schema aplicado (`--database-url-env ENSAIO_DSN`).
2. Conferir as contagens contra a tabela §5 — devem bater exatamente.
3. Conferir `SELECT count(*) FROM composition_components WHERE "compositionId" IN (…)`
   para duas ou três composições conhecidas.
4. Em produção, rodar com `--catalog-id <id do catálogo SEINFRA existente>` e conferir os guardas
   (UF/referência/`sourceType`) — o script aborta sem gravar se não casarem.
5. Só então decidir a execução — que **não** é decisão do script.

**Rollback.** Todo o catálogo entra sob um único `price_catalogs.id` e o import é idempotente por
chave (`ON CONFLICT … DO UPDATE`). Para desfazer uma carga completa:

```sql
DELETE FROM composition_components WHERE "compositionId" IN
  (SELECT id FROM service_compositions WHERE "sourceCatalogId" = :catalogoId);
DELETE FROM service_compositions WHERE "sourceCatalogId" = :catalogoId;
DELETE FROM price_items        WHERE "catalogId"       = :catalogoId;
DELETE FROM price_catalogs     WHERE id                = :catalogoId;
```

Se a execução foi um **complemento** (`--catalog-id`) num catálogo já carregado, o bloco acima
apagaria também o que já existia. Para desfazer **só a Fase 3**:

```sql
DELETE FROM composition_components WHERE "componentType" = 'servico';
DELETE FROM price_items
 WHERE "catalogId" = :catalogoId
   AND "itemType"  = 'servico'
   AND code NOT IN (SELECT code FROM service_compositions WHERE "sourceCatalogId" = :catalogoId);
```

## 7. Limitações conhecidas / trabalho futuro

1. **Composição de composição** (`C…` dentro de `C…`) é representável desde que
   `composition_components_componentType` tenha o valor `servico` (versionado no commit
   `207179a`). O importador já emite esses componentes e cria o `price_items` espelho (§5.2).
   **O que sobra é outro problema:** os **89** serviços sem bloco no arquivo de Composições
   (§5.1) — falta de dado na origem, não falta de modelagem.
2. `service_compositions` não guarda trilha/notas.
3. Composições de versão divergente do catálogo são apenas **avisadas**
   (`--allow-version-mismatch` desliga o aviso) — o arquivo de Composições 028 vs. catálogo
   028.1 não tem versão no nome, então a checagem não dispara.
4. O script grava `price_catalogs.status = 'ativo'`. Se já existir catálogo ativo da mesma
   referência, convém avaliar antes (`price_catalogs` não tem índice único por referência) —
   ou usar `--catalog-id` para não criar outro.
5. ~~**Caminho Supabase pela API está incompleto**~~ — **RESOLVIDO: o trecho morto foi REMOVIDO.**
   Do commit `70d0254` até aqui, o script carregava um bloco "Supabase API" que: criava um client
   Supabase **nunca usado**; exigia `--supabase-url`/`--supabase-key`, que `parseArgs` (`strict:
   true`) **rejeitava** — o que tornava **todo `--execute` inalcançável**; e a gravação logo abaixo
   sempre foi pelo driver `pg`. Era, além disso, a origem dos **2 erros de typecheck** do arquivo
   e chamava um RPC `exec_sql` que não existe em nenhuma migração do projeto. Removido na tarefa
   `01a12b1f-63e8-7981-b232-5bce383ff201` (branch `fix/seinfra-remove-supabase-morto`): o caminho
   de escrita deste script é **único**, `--database-url`/`--database-url-env` + `pg`, e o arquivo
   passou a ter **0 erros** de typecheck. A via REST do Supabase (necessária quando o pooler
   bloqueia o driver `pg`) tem script próprio: `scripts/importar-seinfra-supabase.ts`.
6. **PENDÊNCIA DECLARADA E ACEITA — os 89 serviços sem componente.** Depois do espelho ficam
   **89** composições sem nenhum componente (§5.1). Causa: o arquivo **Composições** não traz
   bloco para esses códigos, embora o **Planos de Serviços** os liste (divergência entre os dois
   arquivos oficiais). Não é falha do importador nem do schema, e **nenhum espelho resolve** —
   só uma fonte de dados complementar. Decisão do lead (2026-10-11): **aceitar como pendência
   declarada** e **não inventar componente** para fechar o número. Impacto: essas 89 composições
   seguem utilizáveis como serviço, mas sem detalhamento de custo.
