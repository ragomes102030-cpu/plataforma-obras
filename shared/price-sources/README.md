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

## Os arquivos da SEINFRA-CE não são intercambiáveis

A Tabela Unificada é distribuída em planilhas separadas, e cada uma serve para
uma coisa:

| Arquivo | Códigos | Serve para | Gera EAP? |
|---|---|---|---|
| `Tabela-de-Insumos` | `I...`, `G...` | insumo, mão de obra, equipamento | não |
| `Planos-de-Serviços` | `C...` | serviço, e a espinha dorsal da obra | sim |
| `Composições` | `C...` + insumos | custo unitário do serviço | sim |

Só o **`Planos-de-Serviços`** tem serviço. Importar a tabela de insumos cria um
catálogo rico e correto, útil para composição e preço unitário, mas **a EAP
continua vazia** — não existe serviço para virar folha. A tela do Catálogo diz
isso; a distinção é medida, não suposta.

## A hierarquia da planilha é o que classifica a EAP

O `Planos-de-Serviços` traz **duas** colunas de código, e confundi-las
quebrava a EAP por completo:

```
ITEM    CÓDIGO   DESCRIÇÃO                UNIDADE  PREÇO UNITÁRIO
1.1.1   C2820    EXECUÇÃO DE SONDAGEM...   UN       623,05
```

`ITEM` é a numeração hierárquica **da própria planilha** (`1.1.1`) e não existe
no catálogo. `CÓDIGO` é o código oficial do serviço. O parser lê `CÓDIGO`; ler
`ITEM` fazia o serviço não casar com `C...` e a EAP nascer vazia mesmo com a
base importada.

As linhas de agrupamento (`1 FUNDAÇÕES E  ESTRUTURAS`, `6.1 TUBULÕES A CÉU
ABERTO`) trazem o nome na coluna de código e a descrição vazia. São elas que
dão a trilha **capítulo > subgrupo**, e essa trilha é o sinal mais forte de
classificação do motor. Medido: por palavra solta, `EXECUÇÃO DE SONDAGEM
ELÉTRICA` e `PROTENSÃO E INJEÇÃO EM CABO` iam para Instalações (por "cabo") e
`DISJUNTOR TRIPOLAR C/ACIONAMENTO NA PORTA DO Q.D.` ia para Revestimentos (por
"porta"). Com a trilha, os 4.435 serviços caem em 5 grupos sem grupo em vez
de 2.519.

### Onde a trilha fica gravada

Em `price_items.notes`, no formato:

```
item 6.6.81 | FUNDAÇÕES E  ESTRUTURAS > ARMADURAS
```

`notes` é a única coluna de texto livre da tabela, e usá-la evitou uma migração
só para levar a taxonomia oficial até o motor. A descrição fica **limpa** de
propósito: ela é o nome que o usuário lê na árvore da EAP. Escrita por
`montarNota`, lida de volta por `extrairTrilha`, e o teste
`seinfra-hierarquia.test.ts` trava a ida-e-volta.

## Quando sair uma versão nova

A taxonomia pode mudar de nome, ganhar capítulo ou deixar de ter algum:

```
npx tsx scripts/conferir-mapa-seinfra.mts <arquivo.xls>
npx tsx scripts/inspecionar-catalogo-seinfra.mts <arquivo.xls> [tipoDeObra]
```

O primeiro acusa nome do mapa que não existe mais na planilha e sugere o mais
próximo. Foi assim que apareceu o erro de digitação "embrasamentos" — a
planilha traz `EMBASAMENTOS`, sem o "R" — que silenciosamente impedia o
override de subgrupo de funcionar. O segundo imprime as folhas que o motor
escolheria, com a trilha ao lado, sem tocar no banco.

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
