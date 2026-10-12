# Auditoria de coerência de engenharia — RODADA 2

**Objeto:** as correções publicadas em `c08cb2a` (a partir da rodada 1, branch
`audit/coerencia-engenharia`, commit `c5abc57`).
**Método:** rodei o **mesmo reprodutor** da rodada 1, `scripts/auditar-coerencia-engenharia.mts`,
**sem alterar nenhuma hipótese** — as cenas que descreviam o defeito devem, agora, dizer
"NAO CONFIRMOU". Depois ajustei as cenas que reproduziam o *chamador antigo* e acrescentei 3 cenas
para a superfície **nova** aberta pelas correções.

```
npx tsx scripts/auditar-coerencia-engenharia.mts          # 25 cenas
npx tsx scripts/auditar-coerencia-engenharia.mts --json
```

**Resultado: 17/25 confirmadas — 8 cenas inverteram.** As correções são reais: verifiquei na saída do
programa, não na descrição do commit.

## 1. O que foi corrigido (e como eu sei)

| Cena | Achado da rodada 1 | Saída agora |
|---|---|---|
| R1-02 | plural: "Instalações"/"Fundações" não casavam (`fundacoes` não contém `fundacao`) | **corrigido** — acusa; comparação por radical |
| R3-01 | item "Fundacoes" com `FCK=15MPa` passava | **corrigido** — acusa, citando NBR 6118 Tabela 7.1 |
| R3-02 | C20 acusado como `error` | **corrigido** — piso 20 |
| R2-03 | obra declarada "mista" acusava o item que ela mesma declara | **corrigido** — silencia |
| R4-03 | divergência de **unidade** virava acusação de **preço** | **corrigido** — virou achado próprio `eng_unidade_composicao_divergente` (warning) |
| R7-01 | `und` × `un` (mesma unidade) acusado | **corrigido** — silencia |
| R9-01 | fundação começando no dia 0 desligava a regra | **corrigido** — compara com o **fim** da fundação; acusa |
| R8-02 | obra sem `tipoDeObra='edificio'` perdia a regra | **corrigido** — acusa como `warning` e não afirma número |
| R10-01 | 12 atividades sem vínculo → 12 achados `error` idênticos | **corrigido** — 1 achado com a lista |
| R10-02 | achado de **cronograma** inflava `valorEmRisco` (R$ 1.000.000) | **corrigido** — `valorEmRisco` só soma domínio orçamento (agora `0,00` nessa cena) |
| R5-01 | composição com 1 de 50 componentes com preço passava | **corrigido** — novo `eng_composicao_preco_incompleto` |
| R6-01 | regra morta: o chamador passava `areaConstruida: null` | **corrigido** — o chamador deriva a área e declara a fonte |

Também: os campos mortos que a rodada 1 apontou (`areaTerreno`, `plannedQuantity`) **saíram do
contrato** — foi o typecheck do meu reprodutor que pegou a mudança.

## 2. O que a rodada 2 encontrou de novo

### R8-03 — o ramo de `error` da regra 8 ficou **inalcançável**

`pavimentos` só é não-nulo quando o chamador acha ≥2 códigos `1.4.N.M`
(`routers.ts:4123-4124`). Mas qualquer código `1.4.N.` faz `temSubnivel = true`, que **desliga** a
regra (`coerencia-engenharia.ts:599-600`). Logo:

> quando o chamador **consegue medir** pavimentos, a regra **não roda**; quando a regra roda, o
> número **não existe**. O `error` "a obra declara N pavimentos" (`:611`) descreve um caminho que o
> app não alcança.

A cena R8-03 prova: dois níveis distintos derivam `pavimentos = 2`, e a regra devolve **zero
achados**. A correção trocou um `error` mentiroso por um `warning` permanente — melhor, mas o
diagnóstico útil ("16 dias para 6 pavimentos é implausível") continua impossível.
*Sugestão:* `pavimentos` como dado **declarado da obra**; e, quando houver subnível, usar os níveis
para checar a duração **por nível** em vez de desistir.

### R6-03 — a área do chamador é o `MAX`, não a soma → falso negativo novo

`routers.ts:4130-4134` pega a **maior** área de piso entre as atividades em m². Com 2 pavimentos de
1.200 m², a "área construída" vira **1.200**, e uma obra a **R$ 1.000/m²** deixa de ser acusada
(R6-03: nenhum achado). É o mesmo vício do "6 pavimentos": um número plausível, obtido por
heurística, exibido como área construída — a mensagem ao menos declara a fonte, o que é bom.

### R6-04 — `custoDireto` é declarado e **nenhum chamador preenche** → falso positivo novo

`grep` no repositório: o campo só existe **dentro do validador**; o mapeamento do chamador
(`routers.ts:4144-4152`) não o inclui. Sem o campo, o numerador do R$/m² cai no heurístico **por
texto** (exclui "sinalização", "teste", "projeto", "mobilização"...). Numa obra viária,
"Sinalização viária" é custo direto: sai da conta e a obra é acusada por **R$ 1.389/m²** quando tem
**R$ 1.528/m²** (R6-04). É o mesmo padrão "campo declarado e nunca alimentado" que a rodada 1
apontou em `compositionUnit`.

## 3. Achados da rodada 1 que continuam abertos

Verificados: a cena ainda confirma.

- **R1-03** — composição de projeto puro (`"ELABORACAO DE PROJETO DE DRENAGEM"`) fora do vocabulário.
- **R1-04** — composição **de execução** que cita "projeto executivo / as built" é acusada.
- **R2-01** — obra sem o sistema escrito na descrição desliga a regra 2 inteira.
- **R2-02** — cobertura em estrutura metálica numa obra de concreto armado (solução corrente).
- **R3-03** — item chamado apenas "Estrutura" não passa pela regra de fck.
- **R4-01** — a banda passou de 20% para **10%**: a mensagem ficou honesta (declara BDI 0%), mas a
  superfície de falso positivo **dobrou**. Se os preços do orçamento carregarem BDI, a regra acusa em
  massa. *Sugestão:* receber o **BDI do orçamento** como entrada declarada e centrar a banda nele, em
  vez de assumir 0%.
- **R4-02** — `soma = 0` continua não sendo "preço sem lastro" (o caso dos R$ 1,4 milhão só é pego
  pela regra 1).

## 4. Reproduzir

```
npx tsx scripts/auditar-coerencia-engenharia.mts
```

Cada cena imprime `CONFIRMOU` / `NAO CONFIRMOU` para a hipótese declarada. Cenário futuro: quando um
achado desta seção 3 for corrigido, a cena correspondente passa a dizer **NAO CONFIRMOU** — é o
sinal de que a correção pegou. O reprodutor não toca banco e não altera dado algum.
