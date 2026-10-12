# Auditoria das 10 regras de coerência de engenharia

**Objeto:** `server/construction/coerencia-engenharia.ts` (commit `8e84a53`), o painel da aba
ORÇAMENTO E CUSTOS e o chamador em `server/routers.ts:4060-4148`.
**Papel:** auditor, não autor. A pergunta de cada regra foi "**que caso real faz esta regra errar?**",
nos dois sentidos:
- **falso positivo** — acusa quem está certo; é o que faz o engenheiro parar de ler a lista;
- **falso negativo** — silencia onde devia acusar; é o que deixa passar o próximo R$ 1,4 milhão.

**Como auditei:** não li só o código — escrevi um reprodutor executável,
`scripts/auditar-coerencia-engenharia.mts`, com **22 cenas** montadas sobre o validador real.
Cada cena declara uma hipótese antes de rodar. **22/22 confirmadas.**
Rode com: `npx tsx scripts/auditar-coerencia-engenharia.mts` (ou `--json`).
A saída bruta está citada aqui; as mensagens entre aspas são as que o validador realmente emite.

**O que eu NÃO fiz:** não toquei em dado nenhum (AURORA intacta), não rodei contra o banco (não
tenho DSN nesta máquina) e **não medi o CUB** — não tenho fonte externa no repositório nem acesso a
rede. Isso está explicitado na seção "O que só o banco responde".

---

## 1. Resumo executivo

**Os "32 incoerências / R$ 2.890.217,30" não podem ser lidos como estão.** Três problemas
independentes, todos medidos:

**A) A métrica `valorEmRisco` está inflada por construção.** Ela soma o valor integral de todo item
citado por achado de severidade `error` — e achados de **cronograma** citam códigos de atividade que
também são códigos de item. Prova (cena R10-02): uma única atividade "sem predecessor" com código
`1.9.1` joga **R$ 1.000.000,00** em `valorEmRisco`, sem que nada de dinheiro esteja errado naquele
item. A UI então escreve "impedem execução" sobre um dado que é uma **ligação faltando no CPM**.
Dinheiro em risco e qualidade de dado estão no mesmo número.

**B) Três regras não conseguem acusar no app real** (e duas delas o próprio teste não pega, porque
injeta no fixture o que o chamador não passa):
- **regra 6** (custo/m²): o chamador passa `areaConstruida: null` fixo (`routers.ts:4124`) → a regra
  **nunca roda em produção** (R6-01: nem com R$ 721/m²);
- **regra 9** (sequência invertida): exige `inicioFundacao > 0` (`:430`) → com a fundação começando
  no dia 0, o caso mais comum, **não roda** (R9-01);
- **regra 8** (ciclo de pavimento): quando acusa, o número de pavimentos é **sempre inventado** —
  ver §4.

**C) O ruído está concentrado em duas regras** — 7 (unidade) e 10 (sem predecessor) — que produzem
achados em cascata e de baixo valor de engenharia. R10-01: 12 atividades sem vínculo = **12 achados
`error`**, cada um com a mesma redação. É exatamente o mecanismo que faz o engenheiro parar de ler.

E o ponto de fundo, que é bom e deve ser preservado: **o diagnóstico do lead está certo** — o sistema
validava forma, não engenharia. O que a auditoria mostra é que o **vocabulário** das regras é fechado
e não considera a morfologia do português, e é aí que nascem os falsos negativos (§3).

---

## 2. Regra por regra

| # | Regra | Falso positivo | Falso negativo |
|---|---|---|---|
| 1 | natureza (escritório × execução) | composição de execução que cita "projeto executivo / as built" (R1-04) | **plural**: "Instalações", "Fundações", "Pavimentações" não casam (R1-02); vocabulário não tem "projeto", "sondagem", "topografia", "laudo" (R1-03) |
| 2 | sistema construtivo | cobertura metálica em obra de concreto (R2-02); obra declarada **mista** acusando o item de alvenaria estrutural que ela mesma declara (R2-03) | obra sem o sistema escrito na descrição desliga a regra inteira (R2-01) |
| 3 | fck < 25 | **C20 é permitido pela NBR 6118** e é acusado como `error` (R3-02) | "Fundações" (plural) e "Estrutura" genérico passam batido (R3-01, R3-03) |
| 4 | preço sem lastro (±20%) | BDI de 25% vira `error` (R4-01); item em `m` com composição em `m3` é acusado como preço, quando a causa é unidade — e a mensagem diz "divergência de 101%" (R4-03) | soma = 0 (o caso dos R$ 1,4 milhão) **é pulada** (R4-02); composição com 1 de 50 preços passa |
| 5 | composição sem preço | — | só acusa quando **zero** componentes têm preço; 1 de 50 passa (R5-01) |
| 6 | custo/m² × CUB | galpão a R$ 1.400/m² é falso alarme (R6-02) | **morta no app** (R6-01); e uma subestimação de 30% passa |
| 7 | unidade divergente | `und` × `un` — a mesma unidade — é acusado (R7-01) | atividade sem item casado não é checada (nenhuma regra cobre item↔atividade) |
| 8 | estrutura sem ciclo de pavimento | o número "6 pavimentos" é fabricado (R8-01) | obra sem `tipoDeObra='edificio'` → `pavimentos=null` → regra desaparece (R8-02); duração absurda **com** subnível passa |
| 9 | sequência invertida | depende de uma única atividade ser "a fundação" | ES da fundação = 0 → não roda (R9-01) |
| 10 | atividade sem predecessor | avalanche: 12 sem vínculo = 12 `error` (R10-01); a flag vem do chamador, cuja consulta de dependências é filtrada por `versionId` — se as dependências tiverem `versionId` NULL enquanto as atividades têm versão, **toda** atividade vira "sem predecessor" | `semPredecessor` não preenchido → regra inerte |

---

## 3. O que faz as regras 1 e 3 falharem: a mesma classe de erro que foi corrigida, em outro lugar

A correção do `contemTermo()` foi aplicada **só em `detectarSistema`** (regra 2). As regras 1 e 3
continuam com `includes()` (`:172`, `:176`, `:196`).

O efeito **mais grave não é o que já foi corrigido, é o plural**. Em português, "fundação" **não**
está contido em "fundações" (…c-a-o × …c-o-e-s), nem "instalação" em "instalações". Como itens de EAP
são nomeados no plural — *Fundações, Instalações, Pavimentações, Escavações, Impermeabilizações* —, a
regra 1 simplesmente **não reconhece como execução física** os itens que mais aparecem na obra.

Prova (R1-02): o caso real dos R$ 1,4 milhão, idêntico ao da AURORA, mas com o item chamado
**"Instalações hidrossanitárias"** → `erros=0`. O R$ 1,4 milhão só foi pego porque o item se chama
"Drenagem externa" e "drenagem" é invariável no plural. **A regra pegou por sorte de grafia.**

Prova (R3-01): item "Fundacoes" com `CONCRETO P/VIBR., FCK=15MPa` → nenhum achado de resistência.
O mesmo item chamado "Fundação" seria acusado.

E do outro lado, o vocabulário é fechado e curto (`TERMOS_ESCRITORIO`, 12 frases): composição
**"ELABORACAO DE PROJETO DE DRENAGEM - SERVICO TECNICO SEM EXECUCAO"** não é reconhecida como serviço
de escritório (R1-03: `erros=0`), porque "projeto" sozinho não está na lista — só "projeto executivo"
e "projeto básico". Faltam também sondagem, ensaio, laudo, topografia, consultoria, supervisão,
plotagem/impressão.

---

## 4. As três dúvidas do lead, respondidas com número

### Regra 4 — "tolerância de 20%, isso é o BDI ou é chute?"

**É chute, e o pior é que a regra finge absorver um parâmetro que o projeto decidiu não assumir.**
Quatro medições:

1. A banda é `razao > 1.2 || razao < 0.8` (`:340`) — **simétrica em torno de 1,0**, isto é, centrada em
   **BDI = 0%**. Não é uma tolerância de BDI: é uma tolerância de arredondamento.
2. **Um BDI de 25% — rotina em obra pública — vira `error`** (R4-01, mensagem: "divergência de 25%",
   `severity=error`, item de R$ 9.199,20). Com 20% exatos passa (a comparação é estrita); com 21% já
   acusa. A faixa usual de BDI em edificação pública começa **acima** do limite da regra (assumo a
   faixa 20-28% da prática do setor; **não** medi contra a planilha de BDI de vocês — se a casa usa
   faixa menor, o número muda, mas a conclusão de que a banda é centrada em BDI=0 não muda).
3. **O projeto não tem BDI.** `docs/analise-planilhas/modelo-dominio.md` C10: *"BDI nunca 0 silencioso
   — bloquear cálculo se fonte ausente"*; `LIMIT-004`: sem cálculo automático de BDI e encargos. Ou
   seja: existe uma decisão de **não** assumir BDI, e a regra 4 assume um valor implícito (zero) e
   tolera ±20% em cima dele.
4. Há um multiplicador legítimo **maior que o BDI** no caminho: a própria planilha SEINFRA traz a
   linha `"028 - ENC. SOCIAIS 114,15%"` e `"BDI: 0,00%"` (`shared/price-sources/seinfra-hierarquia.test.ts:14`).
   Comparar item e composição quando um dos lados está desonerado e o outro não desloca a **mão de
   obra** em até ~2×. A banda de ±20% não cobre nem uma coisa nem outra.

**Recomendação:** antes de comparar preços, comparar **unidades** (o campo `compositionUnit` existe e
**nunca é lido** — R4-03 mostra o estrago: item em `m`, composição em `m3`, mensagem acusando
"divergência de 101%" de preço); receber BDI e regime de encargos como **entrada declarada**; e
enquanto isso não existe, o achado deve ser `warning` de conferência, nunca `error`.

### Regra 6 — "o CUB comercial Ceará 2026 está mesmo em R$ 2.500?"

**Não consigo verificar daqui, e digo isso em vez de inventar:** não há fonte de CUB no repositório
(procurei) nem acesso a rede nesta máquina. O que **posso** medir:

1. **O valor não importa ainda: a regra está morta no app** (`areaConstruida: null` em
   `routers.ts:4124`). R6-01 prova: orçamento de R$ 5.193.043 para 7.200 m² (R$ 721/m²) → `erros=0`,
   `avisos=0`, nenhum achado. Os testes passam porque **injetam** `areaConstruida: 7200` no fixture.
2. **A própria suíte contradiz a constante.** O comentário do teste (`:267`) diz "R$ 721/m2, ~26% do
   CUB comercial" ⟹ CUB ≈ **R$ 2.773**; a constante usada no código é **R$ 2.500** ⟹ 28,8%. Os dois
   números não fecham entre si — sinal de que o valor foi digitado, não consultado.
3. **A base de comparação está errada mesmo com o CUB certo.** O numerador é o **orçamento total**
   (com BDI, encargos, serviços de escritório e obra externa) e o denominador é área construída; o
   CUB é **custo direto da construção** por m² de área equivalente, sem BDI, sem terreno, sem
   urbanização. Comparar os dois mistura bases: infla o R$/m² e faz a regra acusar **de menos**
   (R6-02 mostra o outro lado: quando roda, galpão a R$ 1.400/m² é falso alarme).
4. O piso de 60% é o parâmetro que decide tudo, e não tem lastro: uma obra subestimada em 30% passa.

**Recomendação:** parametrizar CUB (valor + UF + mês de referência) como entrada declarada e
versionada; comparar contra **custo direto**, não contra orçamento total; e manter como informativo
até existir um CUB declarado por obra.

### Regra 8 — "assumir 6 pavimentos é heurística minha"

**Não é heurística: é impossível a regra ver um número real.** Prova estrutural, com as duas pontas
do mesmo código:

- `routers.ts:4116-4119`: `pavimentos` = nº de níveis distintos em `1.4.N.M`, e **só** usa essa
  contagem se `length > 1`; senão cai no fallback `tipoDeObra === 'edificio' ? 6 : null`.
- `coerencia-engenharia.ts:409-413`: a regra só roda quando **não há** subnível `1.4.N.`.

As duas condições são **mutuamente exclusivas**: ter `1.4.N.M` (o que daria pavimento medido) é
exatamente o que desliga a regra. Logo, **sempre que a regra acusa, `pavimentos` é o 6 do fallback** —
e a mensagem afirma "**a obra tem 6 pavimentos**" (R8-01) como se fosse dado da obra. Um número
inventado apresentado como fato é pior que um número ausente.

Outros dois furos da mesma regra:
- **FN**: `tipoDeObra` diferente de `edificio` → `pavimentos = null` → a regra **desaparece** (R8-02),
  justamente em reforma e ampliação, onde representar o ciclo por pavimento é mais necessário.
- **FN**: a checagem de duração absurda está amarrada à *forma* da EAP. Com subnível presente, um
  cronograma com durações absurdas passa — é o que o próprio teste dele prova (`:331-338`), e a
  numeração `1.4` é uma **assunção de EAP** (outra numeração → regra inerte ou acusando o conteúdo
  errado).

---

## 5. Achados transversais

1. **Campos declarados e nunca lidos** (grep no arquivo: aparecem só na declaração de tipo):
   `areaTerreno`, `compositionUnit`, `compositionUnitCost` (sempre `null` no chamador),
   `plannedQuantity`, `earlyFinish`, `critical`. O contrato de entrada promete mais do que as regras
   usam — e `compositionUnit` é justamente o que evitaria o falso positivo R4-03.
2. **A regra 2 afirma uma causa que não pode observar**: a mensagem diz "a vinculação foi feita por
   semelhança de texto, não por sistema". O validador não tem como saber como a vinculação foi feita.
   Isso contraria o princípio declarado por você mesmo ("achado com evidência, nunca um suspeito
   genérico") — o resto das mensagens cita preço, unidade e item, essa cita um método.
3. **Sem deduplicação entre regras**: o caso da AURORA gera `eng_natureza_servico_incompativel`
   (error) **e** `eng_composicao_sem_preco` (warning) — mesma causa raiz, dois itens na lista. O
   validador de EAP do projeto já tem um passo de dedup (`dedupedIssues`); este não tem.
4. **Severidade**: `error` hoje significa ao mesmo tempo "preço sem lastro", "fck baixo" e "falta uma
   ligação no CPM". Sem separar *risco de engenharia* de *qualidade de dado*, o número de erros não
   serve como indicador de nada.
5. **Só a última versão do orçamento é validada** (`routers.ts`, `orderBy desc(versionNumber).limit(1)`):
   versões anteriores e rascunhos não são checados.

---

## 6. Recomendações priorizadas

**P0 — antes de mostrar de novo na tela**
1. Separar `valorEmRisco`: o que é **valor de item acusado por regra de orçamento** × o que é
   **atividade acusada por regra de cronograma**. Achado de cronograma não pode entrar em R$.
2. Parar de usar `error` para falta de vínculo e divergência de unidade → `warning`. "Impede execução"
   não vale para uma ligação faltando.
3. Regra 8: não usar pavimento inventado. Se não há dado, a mensagem não pode afirmar "a obra tem 6
   pavimentos" — no máximo "a superestrutura não está decomposta e não há pavimento declarado".

**P1 — correção de engenharia (vocabulário e bases)**
4. Trocar `includes()` por comparação com **radical** (não palavra inteira) nas regras 1 e 3 — resolve
   plural: `fundac`, `instalac`, `pavimentac`, `escavac`. Adicionar os termos que faltam (projeto,
   sondagem, ensaio, laudo, topografia, consultoria, supervisão).
5. Regra 4: comparar unidade antes de preço e só acusar quando as unidades coincidem.
6. Regra 6: parametrizar CUB; comparar contra custo direto.
7. Regra 2: obra "mista" não pode acusar item de alvenaria estrutural nem de concreto armado — ela
   declara os dois.
8. Regra 9: usar `earlyStart` da fundação **com ES=0 incluído** (não exigir `> 0`).

**P2 — cobertura**
9. Cobrir o par item↔atividade (hoje nenhuma regra cobre orçamento sem cronograma ou cronograma sem
   orçamento).
10. Deduplicar achados por causa raiz antes de exibir.

---

## 7. O que só o banco responde (não rodei: sem DSN nesta máquina)

1. **Quantos dos 32 achados são de regra 7/9/10** (ruído) e quanto de `valorEmRisco` sobra quando
   excluídos os achados de cronograma — é o número que decidiria o P0.
2. **A avalanche da regra 10**: `routers.ts:4108-4112` filtra dependências por `versionId`, e a
   auditoria de `01a120cc-604d` já mediu **6/6 dependências com `versionId IS NULL`** em outro
   projeto. Se na AURORA as atividades tiverem versão e as dependências não, **toda** atividade
   aparece "sem predecessor" — e o número de 32 incoerências seria só a ponta. Vale conferir
   `select count(*) from schedule_dependencies where "versionId" is null`.
3. **Quantos itens têm `unit != composition.unit`** (o falso positivo R4-03, que o campo
   `compositionUnit` evitaria se fosse lido).

---

## 8. Como reproduzir

```
npx tsx scripts/auditar-coerencia-engenharia.mts          # tabela legivel
npx tsx scripts/auditar-coerencia-engenharia.mts --json   # mesma coisa, para diff/registro
```

O reprodutor não toca banco e não altera dado. As 22 cenas são autocontidas; cada uma traz a hipótese
em texto. Se uma hipótese deixar de se confirmar depois de uma correção, a saída diz "NAO CONFIRMOU" —
esse é o sinal de que a correção pegou.
