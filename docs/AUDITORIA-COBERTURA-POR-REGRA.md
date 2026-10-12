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

> a regra de preco conferiu 18 de 53 itens | 35 fora por sem composicao vinculada

Quando ha mais de um motivo, todos aparecem: `35 fora por 30 sem composicao vinculada;
5 unidade divergente da composicao`.

## Como o painel fica (texto emitido pelo componente)

Achados e cobertura **lado a lado**, na mesma tela: a lista de achados vem primeiro e o
bloco de cobertura fecha o painel. O painel emite **dois blocos visuais por regra** (a
contagem, em monoespacada, e o motivo); o medidor imprime os mesmos dois pedacos unidos por
` | `. Texto literal do componente — **nao e screenshot**: nao havia browser nem banco neste
ambiente. As linhas de alcance saem de `medir-cobertura-obra.mts --autoteste`, que usa a
mesma frase do painel:

```
COERENCIA DE ENGENHARIA
5 incoerencia(s) que impedem execucao · 6 aviso(s) · R$ 2.336.306,30 em risco
  ...
O QUE FOI CONFERIDO
Nao haver achado em uma regra significa que ela nao encontrou incoerencia no que conseguiu
conferir. O alcance de cada regra esta abaixo — item fora nao foi reprovado, nao foi conferido.
a regra de natureza do servico                  conferiu 18 de 53 itens  |  35 fora por sem composicao vinculada
a regra de sistema construtivo incompativel     conferiu 1 de 53 itens   |  52 fora por item sem sistema construtivo reconhecivel
a regra de resistencia do concreto              conferiu 18 de 53 itens  |  35 fora por item nao e elemento estrutural
a regra de preco sem lastro                     conferiu 18 de 53 itens  |  35 fora por sem composicao vinculada
a regra de cobertura de preco da composicao     conferiu 18 de 18 composicoes
a regra de custo por m2                         nao havia itens para conferir
a regra de unidade orcamento x cronograma       conferiu 1 de 2 atividades |  1 fora por atividade sem item correspondente no orcamento
a regra de superestrutura e ciclo de pavimento  conferiu 1 de 2 atividades |  1 fora por atividade fora da superestrutura
a regra de sequencia construtiva                conferiu 1 de 2 atividades |  1 fora por atividade que nao e elemento superior
a regra de atividade sem predecessor            conferiu 1 de 2 atividades |  1 fora por atividade que pode comecar sem predecessor (frente de inicio)
```

Caminho **sem achado** (o que antes dizia "Nenhuma incoerencia encontrada" e era lido como
"obra conferida"):

```
COERENCIA DE ENGENHARIA
Nenhuma incoerencia encontrada no que foi conferido. Isto nao afirma que a obra esta coerente
— afirma que as regras nao acusaram nada dentro do alcance delas, que esta declarado abaixo.
O QUE FOI CONFERIDO
  <as mesmas linhas de alcance>
```

Caminho **degenerado** (a analise nao chegou a rodar: sem achado *e* sem cobertura) — a
ultima brecha de falso conforto, fechada:

```
COERENCIA DE ENGENHARIA
Nada foi conferido. A validacao nao chegou a rodar nesta obra, entao nao ha alcance nem
achado para mostrar. Isto NAO e um atestado de coerencia.
```

## Os 28 motivos de exclusao (um teste por motivo)

| Regra | Motivos |
| --- | --- |
| 1. natureza do servico | sem composicao vinculada · composicao nao encontrada · composicao sem descricao |
| 2. sistema construtivo | obra sem sistema declarado nem inferivel · obra declara sistema misto · item sem sistema reconhecivel · item declara sistema misto |
| 3. resistencia do concreto | item nao e elemento estrutural · sem composicao vinculada · composicao sem descricao · composicao nao cita concreto · fck nao declarado na composicao |
| 4. preco sem lastro | sem composicao vinculada · unidade divergente da composicao · soma de componentes indisponivel · preco do item nao informado |
| 5. cobertura de preco | composicao sem componentes |
| 6. custo por m2 | obra sem area construida · item nao e custo direto · custo direto sem valor informado |
| 7. unidade orcamento x cronograma | atividade sem item correspondente · atividade sem unidade |
| 8. superestrutura | atividade fora da superestrutura · superestrutura em nivel unico |
| 9. sequencia construtiva | obra sem fundacao com termino no CPM · atividade que nao e elemento superior · atividade sem earlyStart |
| 10. sem predecessor | atividade que pode comecar sem predecessor (frente de inicio) |

A **ordem** dos motivos dentro de cada regra e a ordem de **acao** para o engenheiro, nao
a ordem dos testes. Defeito real encontrado pelo medidor (`medir-cobertura-obra.mts`): a
regra 3 reportava `"composicao nao cita concreto"` para item **sem composicao vinculada** —
motivo que manda o engenheiro procurar uma composicao que nao existe. Corrigido: o item que
nao e elemento estrutural sai por isso (esta fora da regra com ou sem composicao); o que e
estrutural e nao tem composicao sai por `sem composicao vinculada`.

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

npx tsx scripts/medir-cobertura-obra.mts --autoteste
  cruzamento 53/18/35 ... OK        VEREDITO DO AUTOTESTE -> 4/4 (instrumento confiavel)

npx vitest run
  Test Files 76 passed (76) | Tests 687 passed | 8 skipped (695)
  (coerencia-engenharia.test.ts: 52 -> 86)

npx tsc --noEmit
  limpo (exit 0)

npx vite build
  built in 6.37s (o painel compila)
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

---

**Atualização (R6-02, `docs/AUDITORIA-COERENCIA-CUB-BDI-DECLARADOS.md`):** o R6-02 listado
acima como aberto **foi entregue**. O chamador agora passa `bdiDeclarado` e o CUB declarado;
a regra 6 só roda com CUB declarado; a cobertura ganhou `nota` (o BDI não declarado é nota da
regra 4, não motivo de exclusão). O reprodutor foi de **28/28 para 30/30**. Este bloco é o
registro da rodada da cobertura; o estado atual está no documento do R6-02.

Duas correções ao que está acima, que o R6-02 mudou:
- na tabela DERIVADA, a linha da regra 6 deixa de ser "provável `obra sem area construida`":
  com o CUB como porta de entrada, a AURORA (que não declara CUB) passa a declarar
  **`obra nao declarou CUB`** — o gate do CUB vem antes do da área.
- o chamador **passa a informar `bdiDeclarado`**; a "Nota para o lead" acima (regra 4 presa em
  conferência) deixa de valer quando a obra declara o BDI.
