# Cobertura por regra — declaracao de alcance

Data: 2026-10-09
Escopo aprovado pelo lead (fechado): _cada regra declara quantos itens conseguiu avaliar e quantos ficaram fora; o resumo expoe a cobertura por regra; o painel mostra a cobertura junto dos achados, em linguagem de engenheiro; motivo NOMEADO, nunca generico; nao toca no dado; nao muda severidade de nada; teste para cada motivo de exclusao._

## O defeito que isto fecha

"Sem achado" era indistinguivel de "conferido".

O validador percorria o orcamento, **pulava em silencio** todo item que nao conseguia
avaliar, e devolvia `total: 0` quando nada era acusado. O painel, no caminho sem
achado, escrevia:

> **Nenhuma incoerencia encontrada.** Composicoes correspondem aos servicos, sequencia e
> construtivamente possivel e os precos tem lastro nos componentes.

Na AURORA o numero medido e: **35 de 53 itens (66%) nao tem composicao vinculada**
(`composition_id IS NULL`). A regra de preco conferiu 18 itens. Os outros 35 nao foram
reprovados — nunca foram conferidos. O painel dizia que os precos "tem lastro nos
componentes" para uma obra em que dois tercos dos itens nunca chegaram a ser olhados.

Isto nao e um achado novo e nao e defeito de dado: e **limite de alcance apresentado
como resultado**.

## O que mudou

| Onde | Antes | Agora |
| --- | --- | --- |
| `resumo` do validador | `{ total, erros, avisos, porSeveridade, valorEmRisco, porDominio }` | + `cobertura: CoberturaRegra[]` |
| Cada uma das 10 regras | `continue` silencioso | `continue` + motivo contado |
| Painel (caminho sem achado) | "Nenhuma incoerencia encontrada." | "Nenhuma incoerencia encontrada **no que foi conferido**" + alcance de cada regra |
| Painel (com achados) | so a lista | lista + bloco "O QUE FOI CONFERIDO" |
| `routers.ts:4172` | `compositionUnitCost: null` | removido (campo fora do contrato) |

Forma exposta, por regra:

```ts
{ regra, universo: "itens" | "composicoes" | "atividades", total, avaliados, fora,
  motivo, motivos: [{ motivo, itens }] }
```

- `motivo` e o motivo dominante (maior contagem); `motivos` traz todos, com contagem,
  ordenados do maior para o menor. Uma regra pode ter mais de um motivo.
- `motivo` e **sempre NOMEADO**: `"sem composicao vinculada"`, `"composicao nao cita
  concreto"`, `"fck nao declarado na composicao"`, `"unidade divergente da composicao"`.
  Nunca `"nao aplicavel"`.
- Invariante: `avaliados + fora === total` em todas as regras (testado, e verificado no
  reprodutor).

## Linguagem de engenheiro no painel

> a regra de preco conferiu 18 de 53 itens; 35 fora por sem composicao vinculada

Quando ha mais de um motivo, todos aparecem: `35 fora por 30 sem composicao vinculada;
5 unidade divergente da composicao`.

## Os 26 motivos de exclusao (um teste por motivo)

| Regra | Motivos |
| --- | --- |
| 1. natureza do servico | sem composicao vinculada · composicao nao encontrada · composicao sem descricao |
| 2. sistema construtivo | obra sem sistema declarado nem inferivel · obra declara sistema misto · item sem sistema reconhecivel · item declara sistema misto |
| 3. resistencia do concreto | composicao nao cita concreto · item nao e elemento estrutural · fck nao declarado na composicao |
| 4. preco sem lastro | sem composicao vinculada · unidade divergente da composicao · soma de componentes indisponivel · preco do item nao informado |
| 5. cobertura de preco | composicao sem componentes |
| 6. custo por m2 | obra sem area construida · item nao e custo direto · custo direto sem valor informado |
| 7. unidade orcamento x cronograma | atividade sem item correspondente · atividade sem unidade |
| 8. superestrutura | atividade fora da superestrutura · superestrutura em nivel unico |
| 9. sequencia construtiva | obra sem fundacao com termino no CPM · atividade que nao e elemento superior · atividade sem earlyStart |
| 10. sem predecessor | atividade que pode comecar sem predecessor (frente de inicio) |

Dois casos que **nao** sao exclusao e ficaram travados por teste, para nao virarem
desculpa:

- **regra 8 sem decomposicao** (`1.4.1`, `1.4.2`): a regra *avalia* e acusa
  `eng_estrutura_sem_ciclo_pavimento`. `avaliados: 2, fora: 0`.
- **regra 6 com area e custo direto**: os itens nao-diretos saem com motivo nomeado, mas
  os diretos contam como conferidos.

## O que isto NAO faz

- **Nao toca no dado.** Nenhuma escrita, nenhuma migracao, nenhum ajuste na AURORA.
- **Nao muda severidade nem valor.** Nenhum achado muda de `error`/`warning`, e
  `valorEmRisco` nao e afetado: cobertura entra no `resumo` fora dos `issues`.
- **Nao promove motivo a achado.** "35 fora por sem composicao vinculada" nao gera
  warning. Ligar o motivo a uma acao (ex.: exigir composicao vinculada) e decisao
  separada, nao tomada aqui.

## Um efeito colateral corrigido

O caminho degenerado do procedimento (banco nao configurado) devolvia um `resumo` menor
que o contrato. Isto fazia o tipo do procedimento virar uniao e o painel so enxergar os
campos comuns aos dois lados — foi o que escondeu `porDominio` e, agora, esconderia
`cobertura`. Passa a existir `RESUMO_COERENCIA_VAZIO`, o formato unico para o vazio.

## Evidencia

```
npx tsx scripts/auditar-coerencia-engenharia.mts
  Hipoteses confirmadas: 28/28
  Cobertura confirmada: 3/3        (C1: 18 de 53 · C2: 10/10 fecham a conta · C3: motivo nomeado)

npx vitest run
  Test Files 76 passed (76) | Tests 685 passed | 8 skipped (693)
  (coerencia-engenharia.test.ts: 52 -> 84)

npx tsc --noEmit
  limpo
```

## Como medir a cobertura de uma obra REAL

`scripts/medir-cobertura-obra.mts` — **leitura pura** (guarda em `q()` recusa qualquer
coisa que nao comece com `SELECT`; nao existe `INSERT/UPDATE/DELETE` no arquivo).

```powershell
$env:SUPABASE_DB_URL = "<string de conexao>"
npx tsx scripts/medir-cobertura-obra.mts --obra OB-PUPOCN
```

A string de conexao vem **sempre** de variavel de ambiente; o script recusa recebe-la na
linha de comando (historico e lista de processos). `--json` sai JSON para anexar em
relatorio.

O script replica o mapeamento do chamador real (`routers.ts:4054-4198`) e roda **o mesmo
validador** — entao o numero que ele imprime e exatamente o que o painel vai mostrar,
sem precisar de deploy. Como a replicacao e por copia (o chamador vive dentro do router,
dependendo de sessao e do cliente drizzle), a divergencia e **detectavel**: o script
**cruza** os metadados da base com as medicoes independentes D1-D4 e imprime `DIVERGE`
quando o numero nao bate. Se `DIVERGE` aparecer, a replicacao (ou o dado) mudou — investigar
antes de acreditar na tabela.

`--autoteste` roda o pipeline inteiro com dados sinteticos no formato medido da AURORA
(53 itens, 18 com composicao), **sem banco e sem rede**, e emite um veredito 4/4. Serve para
provar o instrumento antes de apontar ele para um banco de verdade:

```
$ npx tsx scripts/medir-cobertura-obra.mts --autoteste
  CRUZAMENTO ... 53/18/35 OK
  a regra de preco sem lastro conferiu 18 de 53 itens | 35 fora por sem composicao vinculada
  VEREDITO DO AUTOTESTE -> 4/4 (instrumento confiavel)
```

**A cobertura real da AURORA nao foi medida por mim**: nao ha string de conexao nesta
maquina (verificado: `.env*` ausente nos tres worktrees, variaveis de ambiente do shell sem
`DATABASE_URL`/`SUPABASE_*`, perfis do Hermes sem chave de banco). Quem tem a conexao roda
o comando acima e tem o numero em um passo.

### O que os metadados da AURORA permitem prever (DERIVADO, nao medido)

Partindo apenas das medicoes D1-D4 do lead — 53 itens, 18 com `composition_id`, 35 sem —
a cobertura que o validador vai declarar tem estas linhas ja determinadas:

| Regra | Declaracao (derivada) |
| --- | --- |
| 1. natureza do servico | 18 de 53 itens; 35 fora por `sem composicao vinculada` |
| 3. resistencia do concreto | no maximo 18 de 53 (so os com composicao); o resto `sem composicao vinculada` / `composicao nao cita concreto` |
| 4. preco sem lastro | 18 de 53 itens; 35 fora por `sem composicao vinculada` |
| 5. cobertura de preco | 18 de 18 composicoes (as 18 vinculadas tem componente) |
| 6. custo por m2 | depende de `areaConstruida`, que nao vinha declarada — provavel `obra sem area construida` |
| 7. unidade orcamento x cronograma | 18 de 18 atividades (as 18 batem com a atividade, medido em D3) |

O resto exige o dado: e o que o script resolve.

## O que continua aberto (por decisao)

R1-04 (composicao de execucao que cita "projeto executivo"), R2-02, R4-02, R5-01 — e
**R6-02 (CUB declarado por obra: valor + UF + mes)**, que o lead colocou depois desta por
ordem: a cobertura mostra quantos itens a regra 6 realmente avalia, e isso informa como
calibrar o CUB declarado.

## Nota para o lead

O chamador **nao passa `bdiDeclarado`** (`routers.ts:4161-4164`). Enquanto a obra nao
declarar o BDI, a regra 4 opera como conferencia (`warning`), como decidido na rodada 3.
Expor o BDI na UI de obra transforma esses avisos em verificacao — vale como proxima
entrada, junto do CUB declarado.
