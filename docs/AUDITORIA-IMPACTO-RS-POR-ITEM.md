# Impacto em R$ por item — a composição acusa, o item paga

Rodada pedida pelo lead depois de medir na AURORA real (`projectId=7`, com DSN).
Branch `fix/coerencia-impacto-rs-item`. Doc-only não: o código mudou onde o achado
deixava de informar o que decide.

## O problema, medido (não suposto)

O lead mediu quanto dinheiro está preso em item cujo custo **não dá para calcular**:

| classe | itens | valor |
| --- | --- | --- |
| composições somando zero | 12 | R$ 2.730.302,90 |
| composições parciais | 6 | R$ 200.724,80 |
| **total** | **18** | **R$ 2.931.027,70** |

E aí o defeito, que não é de cálculo — é de comunicação:

> A regra 5 acusa a **composição** (C0584) e a regra 4 acusa o **item** (1.13.2).
> Ninguém liga as duas. O engenheiro vê "a composição C0584 está sem preço" e não vê
> "o item 1.13.2 vale R$ 1.448.016,50 e está sem lastro de custo". O achado existe,
> está correto, e não informa o que decide — o R$.

O item 1.13.2 é o caso mais claro: ele **já** aparecia como
`eng_natureza_servico_incompativel` (R$ 1.448.016,50). Dois defeitos reais no mesmo
item, e só um deles virava consequência financeira visível.

## O que mudou

| regra | antes | agora |
| --- | --- | --- |
| 5 — composição sem preço | só o código das composições | cita os itens vinculados e o valor: `Total: R$ ... em N item(ns)`. Itens: `código (R$ valor)` |
| 5 — composição parcial | idem | idem (é o caso pior: o custo *parece* calculável) |
| 4 — item sem base de soma | saía da regra sem nome nem valor, só contado na cobertura | achado próprio `eng_item_custo_nao_conferivel`, **warning**, com `refs` dos itens e o valor |
| 4 — motivo da exclusão | `"soma de componentes indisponivel"` para *não medida* **e** para *zero* | dois motivos: `soma de componentes indisponivel` (null) e `composicao soma zero: sem base de custo` |

O motivo separado importa pelo mesmo motivo que o da regra 3 (`fdd4a4f`): chamar as
duas causas de "indisponível" mandava o engenheiro procurar um dado que existe — e
escondia que o preço está sem base de custo nenhuma.

### Um dono por número (a decisão que evita o próximo defeito)

O mesmo dinheiro aparece na regra 5 (pela composição) e na regra 4 (pelo item). Isso
é verdade do dado, não duplicação de cálculo — mas **não pode virar dois totais
somáveis**. Então:

- a regra 5 é **dona** do valor pela composição;
- a regra 4 nomeia o item e o valor e **diz na mensagem** que é o mesmo valor visto
  pelo lado do item;
- nenhuma das duas cria um agregado novo, e nada entra no `valorEmRisco`.

É o mesmo cuidado que já existe no módulo contra somar dinheiro com qualidade de dado
(R10-02: "dinheiro e qualidade de dado no mesmo indicador").

### O que NÃO mudou

- **Nenhuma severidade.** O achado novo é `warning` — não há desvio medido, há
  ausência de base para medir. Acusar como `error` afirmaria um desvio que ninguém
  calculou.
- **O `valorEmRisco` não se move** (só errors com domínio orçamento entram nele).
  Com o BDI declarado pela obra, a mesma família vira verificação — aí o número muda.
- **Nada no dado.** A AURORA não foi tocada.
- Nenhuma regra nova, nenhum limiar novo: só o que já era acusado passou a dizer o R$.

## O texto que o painel passa a emitir

Cenas reais do reprodutor (`scripts/auditar-coerencia-engenharia.mts`), copiadas da
saída — não escritas à mão:

```
1 composicao(oes) com componentes e NENHUM com preco. O custo nao e calculavel a
partir delas — e o item de orcamento fica sem lastro de composicao. Total: R$
1.448.016,50 em 1 item(ns) de orcamento vinculado(s). Itens: 1.13.2 (R$
1.448.016,50). Composicoes: C0584.
```

```
1 composicao(oes) com MENOS DA METADE dos componentes precificados. O custo parece
calculavel e nao e: a soma sai subestimada sem avisar. Total: R$ 200.724,80 em 1
item(ns) de orcamento vinculado(s). Itens: 1.7.4 (R$ 200.724,80). Composicoes: C3270.
```

```
1 composicao(oes) com componentes e NENHUM com preco. O custo nao e calculavel a
partir delas — e o item de orcamento fica sem lastro de composicao. Sem item de
orcamento vinculado: nao ha valor a calcular. Composicoes: C0095.
```

```
1 item(ns) cujo custo a regra 4 NAO CONSEGUE conferir: a composicao vinculada nao da
base para comparar (soma dos componentes igual a zero ou nao medida). Total: R$
1.448.016,50 em 1 item(ns) de orcamento vinculado(s). Itens: 1.13.2 (R$
1.448.016,50). Nao e divergencia de preco — e ausencia de base para calcular. A causa
esta na composicao e aparece tambem na regra 5: e o mesmo valor, visto pelo lado do
item.
```

**Sem item vinculado, o valor não é inventado.** "R$ 0,00" tem aparência de medição e
seria pior que a ausência declarada; a mensagem diz que não há item. O mesmo vale para
itens vinculados sem preço informado: são declarados como tais, não somados como zero.

## Testes por caso

| caso | o que exige |
| --- | --- |
| composição sem preço **com** item de valor conhecido | a mensagem cita `Total: R$ 1.448.016,50` e o item `1.13.2 (R$ 1.448.016,50)` |
| composição sem preço **sem** item vinculado | cita `Sem item de orcamento vinculado` e **não** contém `R$ 0,00` |
| composição **parcial** | cita `Total: R$ 200.724,80` e o item `1.7.4` |
| item sem base de soma | achado `eng_item_custo_nao_conferivel`, `warning`, `refs: ["1.13.2"]`, valor na mensagem, e a mensagem aponta a regra 5 |
| motivo da exclusão | `null` → `soma de componentes indisponivel`; `0` → `composicao soma zero: sem base de custo` |
| invariante | o achado novo **não** infla o `valorEmRisco` (a cena inteira fica em warning) |
| lista de composições | a mensagem mantém `Composicoes: ...` e `refs` — ganhar o valor não pode esconder a lista |

No reprodutor, as cenas ganharam um campo novo (`contemNoTexto`): achar o **código**
não basta — a cena exige que o **R$ apareça na mensagem**. Sem isso, uma cena passaria
com a mensagem vazia de valor, que é exatamente o defeito que estamos consertando.

## R5-01 está fechado (e duas listas antigas ainda mentem)

`eng_composicao_preco_incompleto` existe com `LIMIAR_COBERTURA = 0.5`
(`coerencia-engenharia.ts`), o teste da cobertura parcial está vivo, e o lead
**confirmou na UI real** (1 composição: C3270). O doc da rodada 2 já dizia "corrigido".

Mesmo assim, a lista de abertos da rodada 3 e a da cobertura por regra ainda chamam
R5-01 de aberto. Corrigir essa duas listas é tarefa própria (doc-only) — **não feita
aqui**, para não misturar escopo. A cena `R5-01` do reprodutor é que foi corrigida
neste commit: ela dizia "não é acusada" (hipótese velha) e agora exige a acusação
parcial, que é o que o código faz e o que o lead mediu.

## Evidência

```
npx tsx scripts/auditar-coerencia-engenharia.mts
  -> Hipoteses confirmadas: 34/34   (era 30/30; +R4-06, R5-02, R5-03, R5-04)
  -> Cobertura confirmada: 3/3

npx vitest run
  -> 76 arquivos, 706 passed | 8 skipped (714)
  -> coerencia-engenharia.test.ts: 96 -> 103 (+7)

npx tsc --noEmit -> exit 0
```

Duas cenas dependem do que o lead mediu e eu não posso reproduzir (R$ 1.448.016,50 do
item 1.13.2 / C0584 e R$ 200.724,80 do item 1.7.4 / C3270): elas usam os números da
medição dele, com o mesmo formato de dado, e estão marcadas assim no reprodutor.
