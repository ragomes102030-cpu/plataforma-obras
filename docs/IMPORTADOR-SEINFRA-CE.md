# Importador em lote — Catálogo SEINFRA-CE

Script **standalone** que carrega o catálogo SEINFRA-CE (insumos, serviços e composições)
nas tabelas de preço do plataforma-obras.

- Arquivo: `scripts/importar-seinfra-catalogo.mts`
- Execução: `npx tsx scripts/importar-seinfra-catalogo.mts [opções]`
- Branch de trabalho: `feat/seinfra-importer` (base `dcc8626`)
- **Status: nunca foi executado contra banco algum.** Somente dry-run, `--print-sql` e typecheck.

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
```

`--help` lista todas as opções.

## 4. Salvaguardas de escrita

- **dry-run é o padrão.** Só `--execute` libera escrita.
- `--execute` exige DSN **e** `--user-id` (senão sai com código 3).
- DSN de produção conhecida (`…tromrvfijbtihuilvnuk…`, `…onrender.com`) é **recusado**
  (código 4) mesmo com `--execute`; exige `--allow-production` explícito.
- O host é impresso **sem senha** (`usuario:***@host:porta/banco`).
- Tudo em **uma transação**: `BEGIN` … `COMMIT`, com `ROLLBACK` em qualquer erro.
- `--database-url`/`--database-url-env` sem `--execute` não são sequer lidos.

## 5. Resultado do dry-run — 028.1 / ENC. SOCIAIS (84,44)

Medido em 2026-10-09, sem nenhuma escrita:

| Destino | Linhas | Observação |
| --- | --- | --- |
| `price_catalogs` | 1 | `referencePeriod = 028.1`, `state = CE` |
| `price_items` | 16 264 | 11 828 insumos + 4 436 serviços |
| `service_compositions` | 4 436 | código é único na tabela |
| `composition_components` | 21 119 | 21 104 efetivamente graváveis (15 ficam sem destino, ver abaixo) |

Avisos do dry-run:

- **88 linhas ignoradas** do arquivo de Insumos — conferidas uma a uma: são banners de seção
  (`COTAÇÃO / …`) e re-execuções do cabeçalho (`Insumo | Descrição | Valor (R$)`).
  **Nenhum insumo real é perdido.**
- **1 código repetido** nos Planos de Serviços: `C2721`, com descrição, unidade e preço
  idênticos. O script deduplica e reporta (o `ON CONFLICT` não aceita chave duplicada
  no mesmo `INSERT`).
- **2 162 componentes `C…` descartados** — são *composições dentro de composições*.
  O enum `composition_components_componentType` só admite `material`, `mao_de_obra`,
  `equipamento`; **não existe `servico`**. Descartar é silencioso por design, por isso o
  contador e os exemplos aparecem no relatório.
- **159 composições ficam com 0 componentes** porque todos os seus componentes são `C…`
  (consequência do item anterior). Ex.: `C0375` (contém `C1405`, `C3271`).
- **4 composições sem serviço correspondente** no arquivo de Planos: `C0734`, `C3913`,
  `C3914`, `C2132`. Isso é divergência **entre os arquivos oficiais**, não falha de parsing
  (`C3913`/`C3914` = "RECICLADORA A FRIO"). Consequência: os **15 componentes** dessas 4
  composições não têm a que serviço se amarrar e não são gravados — o relatório mostra
  `compositionComponents: 21119` **e** `compositionComponentsPrevistos: 21104`.
- **0 órfãos** (todo componente `I…`/`G…` encontrou seu item no catálogo) e **0 truncamentos**
  de descrição/unidade. A checagem de órfãos foi validada ao rodar com `--limit` (aí sim
  acusa milhares) — ou seja, não é uma verificação vazia.

### Trilha da EAP

O parser extrai a trilha hierárquica (`item 1.1.1 | CAPÍTULO > SUBGRUPO`) e a grava em
`notes`. **`service_compositions` não tem coluna de notas**, então a trilha dos serviços só é
persistida com `--also-import-services-as-items`, que grava os mesmos serviços também em
`price_items` (onde `notes` existe). Sem essa flag, o script **avisa** que a trilha será
perdida.

## 6. Antes de executar de verdade

O caminho de escrita **nunca foi executado** (a tarefa proibia rodar contra produção), então
ele está verificado apenas por revisão + typecheck + `--print-sql`. Ordem recomendada:

1. Ensaiar num banco de ensaio com o schema aplicado (`--database-url-env ENSAIO_DSN`).
2. Conferir as contagens contra a tabela §5 — devem bater exatamente.
3. Conferir `SELECT count(*) FROM composition_components WHERE "compositionId" IN (…)`
   para duas ou três composições conhecidas.
4. Só então decidir a execução em produção — que **não** é decisão do script.

**Rollback:** o import é idempotente por chave (`ON CONFLICT … DO UPDATE`) e todo o catálogo
entra sob um único `price_catalogs.id`. Para desfazer:

```sql
DELETE FROM composition_components WHERE "compositionId" IN
  (SELECT id FROM service_compositions WHERE "sourceCatalogId" = :catalogoId);
DELETE FROM service_compositions WHERE "sourceCatalogId" = :catalogoId;
DELETE FROM price_items        WHERE "catalogId"       = :catalogoId;
DELETE FROM price_catalogs     WHERE id                = :catalogoId;
```

## 7. Limitações conhecidas / trabalho futuro

1. **Composição de composição não é representável** no schema atual (159 casos + 2 162
   componentes). Exige decisão de modelagem: `ALTER TYPE composition_components_componentType
   ADD VALUE 'servico'` (escrita em produção — fora do escopo deste script) ou coluna
   auto-referente.
2. `service_compositions` não guarda trilha/notas.
3. Composições de versão divergente do catálogo são apenas **avisadas**
   (`--allow-version-mismatch` desliga o aviso) — o arquivo de Composições 028 vs. catálogo
   028.1 não tem versão no nome, então a checagem não dispara.
4. O script grava `price_catalogs.status = 'ativo'`. Se já existir catálogo ativo da mesma
   referência, convém avaliar antes (`price_catalogs` não tem índice único por referência).
