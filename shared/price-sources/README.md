# Fontes de preços de referência

Módulo que importa bases oficiais de preços (xlsx manual, **sem scraping**) e
alimenta o catálogo (`priceCatalogs`/`priceItems`) para reconciliação com
itens de orçamento.

## Por que SEINFRA-CE primeiro

- Base oficial do governo do Ceará (Tabela Unificada SEINFRA), usada em
  obras estaduais — é a referência natural para obras CE na plataforma.
- Distribuída como download manual de `.xls`/`.pdf` estável o suficiente para
  um adapter de planilha (layout de colunas por cabeçalho, não por índice).
- SINAPI e fontes próprias entram depois **pelo mesmo ponto de extensão**,
  sem reescrever o pipeline.

## Por que sem scraping

O site público da Seinfra não tem garantia de layout/URL estáveis; o fluxo é
**usuário baixa o arquivo e faz upload**. Isso mantém auditoria de origem
(arquivo + referência + usuário que importou).

## Como plugar o próximo adapter (SINAPI)

1. Implementar `PriceSourceAdapter` em `shared/price-sources/sinapi.ts`
   (`canParse` + `parse` → `ParsedPriceRecord[]`).
2. `registerPriceSourceAdapter(sinapiAdapter)` no bootstrap do servidor
   (mesmo ponto onde `seinfraAdapter` é registrado).
3. O importador (`catalog.importPriceSheet`) já seleciona o adapter pelo
   `sourceType` — nada muda no router/UI além do enum de origem.

Arquivos: `types.ts` (contrato + registry), `seinfra.ts` (adapter atual),
`matching.ts` (fuzzy por nome + limiar de preço).

## Política de matching (importante)

- Matching é **sugestão com score**, nunca autolink automático.
- Toda aceitação/rejeição de match grava `projectAuditEvents` com:
  descrição manual, descrição escolhida, score, variação de preço, timestamp.
- Alerta de variação: se `|manual − sugerido| / manual` >
  `PRICE_VARIATION_THRESHOLD_PCT` (env, **default 30**), a UI avisa antes do
  confirm. **É parâmetro configurável, não constante de código** — pode ser
  ajustado por ambiente (`PRICE_VARIATION_THRESHOLD_PCT=40`) sem deploy.
  Composições grandes e insumos miúdos podem exigir limiares diferentes em
  futuras iterações (ex.: por `itemType`); por ora um único threshold global.

## Exceção de item

Item de orçamento sem par na base vira `budgetItems.isPriceException = true`
(“fora da base padrão da obra”), consultável em relatório — não é texto livre.

## Versionamento

Cada upload gera um novo `priceCatalogs` com `referencePeriod` próprio; o
histórico anterior nunca é sobrescrito. Preços congelados em composições
(`compositionComponents.unitPriceSnapshot`) e orçamentos aprovados não são
alterados por import.
