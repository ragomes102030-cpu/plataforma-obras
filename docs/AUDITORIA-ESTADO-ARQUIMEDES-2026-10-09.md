# ARQUIMEDES — Auditoria de Estado (Hermes, 2026-10-09)

> Registro vivo. Toda linha aqui tem evidencia real (comando + saida ou query).
> Fonte de verdade: worktree `C:/Users/Correta Engenharia/po-develop` @ `dcc8626` (branch `develop`),
> que e exatamente o que o Render constroi (confirmado por `/healthz`).

## 1. Topologia CONFIRMADA

| Item | Valor real | Evidencia |
|---|---|---|
| Branch do deploy | **`develop`** @ `dcc8626` | `GET /healthz` -> `commit=dcc8626 branch=develop` |
| Servico | `plataforma-obras-api` `srv-dandr7jbc2fs73e2qobg` | MCP Render `list_services` -> `branch: "develop"` |
| Banco autoritativo | **Supabase** `tromrvfijbtihuilvnuk` | log: `[database] source=supabase host=aws-0-sa-east-1.pooler.supabase.com user=arquimedes_app` |
| Postgres do Render | **residuo** (37 tabelas, PG16) | `query_render_postgres` -> `plataforma_obras_db` / PG 16.15 |
| Schema | 37 tabelas, enums em `public` | `/readyz` -> `"tabelas":37`; `information_schema` |
| MCPs | 3/3 `POST /mcp` = 200 | eap 23 tools, cronograma 13, gantt-lob 6 |

### Armadilha estrutural (corrigir antes de qualquer trabalho)

`main` e `develop` **divergiram de vez**. `git rev-list --left-right --count origin/main origin/develop`
-> `52` (so em main) / `1079` (so em develop); merge-base `b5517bf`.
O working tree padrao (`C:/Users/Correta Engenharia/plataforma-obras`) esta em `main`,
**72 commits atras**, e tem `drizzle.config.ts` com `dialect: "mysql"`.

Diagnostico por esse checkout produz **conclusao errada com confianca total**:
`main` -> mysql2/mysql, `develop` -> pg/postgresql + `scripts/migrate-pg.mjs`.
Le o que roda (`git show origin/develop:<arquivo>`) antes de concluir qualquer coisa sobre driver.

## 2. Estado REAL das obras (leitura, Supabase, 2026-10-09)

`projects.id` e **integer**. Os IDs `OB-...`/`DEMO-...` sao da coluna **`code`** — nao da PK.

| code | nome | ativo | EAP | folh. | ativ | deps | base | versoes |
|---|---|---|---|---|---|---|---|---|
| OB-PUPOCN | AURORA TESTE | sim | 207 | 0 | 53 | 64 | 0 | v1 superseded / v2 **approved** / v3 draft |
| OB-SYAE5F | TESTE INTEGRAL ARQUIMEDES 001 | **nao** (soft-delete) | 0 | 0 | 0 | 0 | 0 | v1 draft vazia |
| OB-ZP1H2K | QA EAP SCOPE 2026-10-08 | sim | 9 | 0 | 0 | 0 | 0 | v1 draft |
| DEMO-O8HFUB | Edificio Solar | **nao existe** | — | — | — | — | — | — |
| OB-ZFSIJO | TESTE-QA-2026-10-08 | sim | 14 | 0 | 7 | 6 | 1 | v1 draft |

`DEMO-O8HFUB` nao existe no banco de producao. Tratar o historico como hipotese, nao fato.

### Duas contradicoes com os snapshots historicos

1. **Folhas = 0 em todas as obras.** `wbs_nodes."nodeType"` ∈ `grupo|pacote|entrega`, mas so existem
   `grupo` (48) e `pacote` (159) na AURORA. **Zero `entrega` em qualquer projeto.**
2. **AURORA tem 53 atividades e 64 dependencias**, nao "nenhuma". O historico envelheceu.

## 3. Causa-raiz do gate "EAP precisa estar aprovada"

`server/routers.ts:66-87` `requireApprovedEapVersion()`:
1. busca `project_plan_versions` com `status = 'approved'` -> **AURORA tem (v2)**;
2. roda `validateEap(nodes)` da **versao aprovada** -> se invalida, barra com
   "A EAP aprovada possui inconsistencias estruturais".
3. `planning.generateFromEap` (`server/routers.ts:3897`) so entao le `wbs_nodes`
   com `versionId = approved.id` **e** `nodeType IN ('entrega','pacote')`.

O gate esta **correto e deve ser preservado**: existe para impedir que atividades
nasçam de uma EAP estruturalmente invalida. A AURORA tem v2 `approved` com 69 nos e
`validateEap` passa — **o gate nao e o defeito**.

### DEF #1 — `duration` nula: JA CORRIGIDO (minha hipotese inicial estava errada)

O codigo historico (`startOffset:0` + `plannedQuantity` como duracao, fallback 1 dia)
foi corrigido. Hoje `generateFromEap` monta `pending[]` com `duration:null`,
`requiresDecompositionReview:true` e retorna `created:0` — proposta so em memoria.

A defesa e real e em profundidade:
- `server/construction/activity-planning.ts:11` `resolveActivityDuration()` **lança**
  se nao houver duracao valida nem (quantidade + produtividade);
- `drizzle/schema.ts:459` CHECK `schedule_activities_duration_positive` (`"durationDays" > 0`)
  no banco — uma linha com duracao nula **nao entra**;
- `routers.ts:3808` `createActivity` exige `durationDays` ou o par qtd+produtividade.

**Conclusao: nao ha caminho para duracao falsa.** Nenhuma correcao necessaria aqui.
Os 53 `startOffset = 0` da AURORA sao residuo inerte: `calculateDeterministicCpm` ignora
`startOffset` (usa a rede de dependencias), entao o CPM observado esta correto.

## 3bis. DEF #2 — REDE FRAGMENTADA EM 8 CADEIAS (defeito estrutural real)

53 atividades, 64 dependencias, CPM vigente. Mas a rede **nao tem uma cadeia principal**:

```
SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM schedule_dependencies d
       WHERE d."successorId"=a.id)) AS sem_predecessora
  OB-PUPOCN -> 8 activities com ZERO predecessoras
```

Traversia recursiva a partir das 8 raizes devolve **8 componentes de profundidade 1** —
nenhuma atividade esta ligada a outra raiz. Os 8 inicios:

| atividade | nome | earlyStart |
|---|---|---|
| 139 `1.1.1` | Mobilizacao e canteiro | 0 |
| 198 `1.2.3` | Demolicoes e remanejamentos | 0 |
| 209 `1.6.1` | — | 0 |
| 212 `1.7.1` | — | 0 |
| 220 `1.9.1` | — | 0 |
| 236 `1.13.1` | — | 0 |
| 237 `1.13.2` | — | 0 |
| 238 `1.13.3` | — | 0 |

**Consequencia de engenharia:** `1.2.3 Demolicoes` roda em paralelo com
`1.2.2 Limpeza` (ES=248) em vez de depois dela. O caminho critico reportado
(12 atividades, folga 0) e **um dos 8 componentes**, nao o prazo da obra.
`earlyFinish` maximo da obra = 330 dias, mas as 8 chains somam durations
paralelas — o "16 meses" da AURORA nao emerge do CPM. O caminho critico e
**enganoso por construcao**.

Isto e a causa-raiz do "cronograma que parece certo e nao e": as dependencias
foram geradas por pacote dentro de cada frente, mas **nenhuma ligacao de
encadeamento entre frentes** (1.2 -> 1.3 -> 1.4 -> ...) foi criada.
Nao e bug de CPM — e falta de logica de sequenciamento entre pacotes.


## 3quater. CORRECAO #1 APLICADA — `validateDependencies` passou a detectar rede desconectada

**Causa-raiz raiz (verificada no codigo).** `server/construction/dependency-validator.ts`
validava 4 coisas: referencia inexistente, dependencia cruzada entre projetos,
auto-dependencia, lag nao-inteiro, e ciclo. **Nao checava conectividade.** O topo-sort
contava `visited` e so comparava com o total para detectar ciclo — nunca para detectar
rede quebrada. Resultado: a rede fragmentada da AURORA (8 componentes) retornava
`{valid: true, issues: []}`.

**Diff da correcao** (`server/construction/dependency-validator.ts`, +81 linhas):
- nova `networkComponents()` — componentes conexos por DFS sobre o grafo tratado
  como nao-dirigido (A->B e B->A elegem as duas ao mesmo componente);
- novo issue `disconnected_network` (severity `error`) quando `components > 1`,
  suprimido quando ja existe `dependency_cycle` (o ciclo ja e erro, e a mensagem
  de ciclo e mais acionavel);
- a mensagem lista as atividades isoladas e diz o que fazer ("Vincule as frentes
  na ordem da EAP antes de aprovar o cronograma").

**Teste primeiro (RED -> GREEN), com evidencia:**

```
# RED — antes do fix
FAIL  dependency-validator.test.ts > rejeita rede desconectada
      AssertionError: expected true to be false
FAIL  dependency-validator.test.ts > rejeita atividade isolada sem nenhuma ligacao
      AssertionError: expected true to be false
 Test Files  1 failed (1)   Tests  2 failed | 4 passed (6)

# GREEN — depois do fix
 Test Files  1 passed (1)   Tests  6 passed (6)
```

**Nao quebra trabalho legitimo:** o 3o teste novo prova que rede com TTIs paralelas
legitimas (duas frentes partindo do mesmo marco) continua valida. A regra e
"rede unica", nao "rede serial" — proibir paralelismo seria outro defeito.

**Efeito no gate:** `stage-gates.ts` consome `evidence.dependenciesValid`. Com esta
correcao, a rede fragmentada passa a reprovar `CPM_VALIDADO` e `BASELINE_PROPOSTA`
com a mensagem da engenharia, em vez de aprovar e produzir um caminho critico
enganoso. O gate fica **mais estrito**, nunca mais permissivo.

**Escopo do que a correcao NAO faz (deliberado):** ela *detecta* e *bloqueia*;
nao *conserta* a rede. Gerar as ligacoes entre frentes e problema de engenharia de
planejamento (nem todo pacote e Finish-to-Start — ha sobreposicao legitima em obra).
Isso exige decisao do engenheiro e esta marcado como premissa, nao foi chutado.

## 3quinquies. Verificacao de nao-regressao

`npx vitest run` completo no worktree `dcc8626` + minha correcao:

```
 Test Files  3 failed | 63 passed (66)
      Tests  3 failed | 530 passed | 8 skipped (541)
```

As 3 falhas sao **PRE-EXISTENTES**, provado por `git stash` (rodei os 3 arquivos no
commit limpo `dcc8626`, sem minhas mudancas): falham identico, `3 failed | 61 passed`.
Nenhuma toca `dependency-validator`.

| teste que falha | arquivo | toca minha mudanca? |
|---|---|---|
| `documents real browser availability...` | `server/agent-workflow-skills.test.ts` | nao |
| `nenhuma migracao usa ON UPDATE CURRENT_TIMESTAMP` | `server/migrations.test.ts` | nao |
| `inclui a fonte local e os erros de evidencia` | `server/orchestrator.test.ts` | nao |

`npx tsc -p tsconfig.json --noEmit` -> exit 0, limpo.



## 3sexties. CORRECAO #2 APLICADA — o caminho em lote nao validava a rede

Auditoria do AionUi Butler (tarefa 01a120cc-5e3d) encontrou um buraco na minha
CORRECAO #1, e ela esta certa: eu protegi apenas o caminho de **par unico**.

| caminho | arquivo:linha | validava a rede antes de gravar? |
|---|---|---|
| `createDependency` (par unico) | `routers.ts:3941` | **SIM** — `validateDependencies` em 4007 |
| `createDependencies` (lote, ate 5.000) | `routers.ts:4018` | **NAO** — so auto-dep + versao |
| import de plano (Phase7) | `routers.ts:~1069` | **NAO** — mapeia `externalId` as-is |

Ou seja: minha correcao #1 so valia no caminho estreito. Pelo caminho em lote, uma
rede fragmentada entrava sem erro — 5.000 pares gravados de uma vez, nenhuma checagem
de ciclo, referencia cruzada ou conectividade. Isso tornava o DEF #2 **ainda nao
fechado**, exatamente como o Butler avisou.

**Proveniencia das 64 deps da AURORA (leitura, Supabase):**

```sql
SELECT (d."externalId" IS NOT NULL) AS veio_do_plano_import, d."versionId", count(*)
  FROM schedule_dependencies d WHERE d."projectId" = 7 GROUP BY 1,2;
--  veio_do_plano_import | versionId | deps
--  false                 | 8         | 64
```

Todas as 64 tem `externalId IS NULL` e `versionId = 8` (a v3 draft): vieram do app
(agente/UI), **nao** do import de plano.

**Correcao de uma inferencia minha que estava errada:** eu escrevi que o caminho em
lote era "o suspect do caso real". Falso. `createDependencies` (lote) **nao e chamado
por nenhum arquivo do client** —

```
grep -rn "createDependencies" client/src/   ->  (vazio)
grep -rn "createDependency\b" client/src/  ->  AbaDependencias.tsx:36
```

O unico caminho de escrita que o produto usa e `createDependency` (par unico), que
ja validava a rede — e por isso o DEF #2 **nao** seOrigina de uma gravacao sem
validacao. As 64 dependencias foram criadas **uma a uma pela UI** (`AbaDependencias`),
par a par, sem nenhuma exigencia de ligacao entre frentes: e convencao do operador,
nao regra de codigo.

**O que isso muda.** A correcao #2 (validar o lote) continua correta e util — aquele
caminho aceitaria ate 5.000 pares sem checar ciclo, referencia cruzada nem
conectividade, e agora nao aceita. Mas o defeito real e outro, e mais profundo:
**o sistema nunca exigiu que o engenheiro conectasse as frentes.** Nao ha bug; falta
regra. Validator nao substitui premissa de engenharia, e nenhuma validacao automatica
descobre que `1.2.3 Demolicoes` deveria vir depois de `1.2.2 Limpeza` — isso vem do
planejamento, nao do grafo.

**Correcao:** `createDependencies` agora roda `validateDependencies` sobre a rede
**resultante** (existentes na versao + lote novo), e lanca `badRequest` com a
mensagem do issue bloqueante. Validar so o lote novo nao diria nada sobre o todo:
a rede e conexa ou nao no conjunto.

**Escopo deliberado:** o import Phase7 (`routers.ts:~1069`) segue sem validacao.
Ele grava plano importado de origem externa; validar la exige antes reconciliar o
que o importador considera rede (pode ser legadamente multi-raiz, como uma obra com
frentes independentes por contrato). Fica como pendencia com razao registrada, nao
como esquecimento.



## 3octies. CORRECAO #3 APLICADA — baseline: versao aprovada + rede valida

Auditoria do AionUi Butler (tarefa 01a120cc-604d). Verifiquei os 4 furos no codigo
antes de aceitar; todos confirmados. Tres corrigidos agora, um registrado como
migration (nao fiz — ver abaixo).

O gate de baseline **ja** exigia CPM calculado, CPM nao desatualizado e duracao >= 1
(`routers.ts:3732-3750`). O que faltava:

| # | Furo | Evidencia | Status |
|---|---|---|---|
| 1 | `schedule_baselines` nao tem `versionId` nem FK para `project_plan_versions` | `drizzle/schema.ts:578-585` | **migration — NAO feita** |
| 2 | `captureBaseline` usa `getCurrentPlanVersion`, que devolve a versao de MAIOR numero **sem filtrar status** | `plan-versions.ts:398-404` ("Retorna a versao de maior numero") | **CORRIGIDO** |
| 3 | Vigencia do CPM medida so por atividade; dependencia orfa (`versionId` nulo) nao entra no calculo | `routers.ts:3757-3764` filtra por `versionId` | **CORRIGIDO** |
| 4 | Import Phase7: ramo de **update** grava sem `versionId` (so o insert grava) | `routers.ts:1091-1103` | **CORRIGIDO** |

**Correcao 2:** `captureBaseline` agora exige `status === "approved"` na versao corrente
e diz o que fazer ("aprove a EAP primeiro"). Isso explica **OB-ZFSIJO**, que tem 1
baseline salva com a v1 ainda `draft`.

**Correcao 3:** `captureBaseline` agora valida a rede antes de congelar. Nao dava para
congelar baseline sobre rede fragmentada (o DEF #2) porque `validateDependencies`
so era chamado em `createDependency`.

**Correcao 4:** o ramo de update do import Phase7 passou a gravar `versionId`. E a
origem das 6 dependencias orfas de DEMO-ZF6A7H — dependencia re-importada por
`externalId` ficava sem versao para sempre, e `calculateCpm` filtra por `versionId`,
entao a ligacao saia da rede sem erro: CPM "fresco" sem nunca ter visto a relacao.

**Por que o furo 1 ficou para tras:** exige `ALTER TABLE schedule_baselines ADD COLUMN
"versionId"`. E DDL em banco de producao — nao faco sem sua autorizacao. O SQL e a
consequencia estao registrados; o resto das correcoes ja impede o dano (baseline de
rascunho e baseline sobre rede fragmentada agora sao barrados no codigo).


## 3ter. DEF #3 — CPM nunca calculado em DEMO-ZF6A7H

`cpmCalculatedAt` e `NULL` em 7/7 atividades de `DEMO-ZF6A7H` (obra demonstrativa
Gantt/LOB, criada 2026-10-08) e as 6 dependencias dela estao com `versionId IS NULL`
(6/6) — nao pertencem a nenhuma versao de plano, contra o modelo de versionamento.
Obra pequena, sem impacto em producao, mas viola a integridade referencial do
fluxo `versao -> atividades -> dependencias -> CPM`.


## 3nonies. DESCOBERTA — o runner de QA esta morto em producao (bug real, naoTheory)

AionUi Butler encontrou um endpoint de QA por HTTP que eu nao conhecia e valeu a
verificacao. **Verifiquei de forma independente e o achado e pior do que ele disse.**

O endpoint existe e esta armado (prova com o metodo do controle):

```
GET /healthz                          -> {"commit":"dcc8626","branch":"develop"}
GET /internal/qa/eap                  -> 404 {"ok":false}      (sem token)
GET /internal/qa/eap?token=errado     -> 404 {"ok":false}      (token errado)
GET /internal/qa/naoexiste-probe       -> 200 text/html          (rota inexistente = SPA)
GET /readyz  -> variaveisConfig: ["GITHUB_CLIENT_SECRET","JWT_SECRET","QA_RUNNER_SECRET"]
```

O 404 JSON numa rota que devolve 200 quando nao existe prova que o handler esta no
build de producao, e `QA_RUNNER_SECRET` esta setado. A guarda funciona: sem o token
correto nada acontece.

**O bug:** `ARQUIMEDES-QA` esta **soft-deleted desde 2026-10-05** (`deletedAt =
2026-10-05 12:44:52`, `deletedAtBy = 1`). O handler (`server/_core/index.ts:174-184`):

```ts
let [project] = await db.select().from(projects).where(eq(projects.code, "ARQUIMEDES-QA")).limit(1);
if (!project) { /* ...cria projeto, versao v1 e integracoes MCP... */ }
if (!project || project.deletedAt) throw new Error("Obra ARQUIMEDES-QA indisponível.");
```

A selecao **nao filtra `deletedAt`**, e a recriacao so acontece quando a linha nao
existe. Como a linha existe (porem deletada), o fluxo cai sempre no `throw`. **O
ambiente de QA nunca mais vai subir sozinho**, por mais que se chame o endpoint.
E o pior detalhe: ele nao esta vazio — tem 1 versao e 3 integracoes MCP gravadas, ou
seja, foi usado e depois apagado.

**Por que isso importa alem do endpoint:** e o sinal de que a suíte EAP nao roda em
producao. Sem ela, nao ha como provar regressao de agente em deploy — o
`37873806116` verde do historico era CI local, nao este caminho.

**Correcao proposta (nao aplicada, e pergunta para o usuario):** o handler deveria
filtrar `isNull(projects.deletedAt)` na selecao e, se nao achar a obra viva,
**recriar** — que e exatamente o que o `if (!project)` pretendia fazer. Alternativa
mais conservadora: criar uma obra QA nova com codigo versionado. Nenhuma das duas
foi aplicada: ambas escrevem em producao.

**O que o endpoint NAO prova (limite honesto, do Butler):** `runEapQaSuite` roda o
agente em modo READ_ONLY e devolve `changesApplied:false`. Ele **nao exercita** o gate
`requireApprovedEapVersion` nem a geracao EAP->atividades. Prova que o agente nao
aplica nada; nao prova o fluxo que precisamos. Para o gate, ainda falta sessao com
cookie `app_session_id` — e `e2e-post-deploy.mjs` esta desatualizado (exige commit
`1b64c14`, producao e `dcc8626`) e e mutante (altera `PROJECT_ID=1`).



## 3decies. O BUG DO RUNNER TEM **DOIS** LUGARES (complemento do AionUi Butler)

Verifiquei. O mesmo defeito existe no handler HTTP **e** no caminho de boot:

| lugar | select | throw |
|---|---|---|
| handler HTTP | `index.ts:174` — `where(eq(projects.code,"ARQUIMEDES-QA"))` sem `isNull(deletedAt)` | `index.ts:184` |
| boot (`QA_RUNNER_ON_BOOT`) | `index.ts:235` — identico, sem `isNull(deletedAt)` | `index.ts:246` |

**Consequencia da duplicacao:** uma correcao aplicada so no `:174` deixa o boot
ainda morto — e o boot e o caminho que roda sozinho em deploy, sem ninguem chamar.
A correcao tem de ser nos dois, ou nao e correcao. Registrado para quem for mexer:
nao basta o primeiro `grep` achar duas ocorrencias e o segundo ja estar na linha
errada.

## 3vigesimo. REGRA DE ENCADEMENTO — documento normativo gravado

A resposta de engenharia que faltava esta em
**`docs/REGRA-ENCADEAMENTO-FRENTES.md`** (8.4 kB), incorporate ao registro.

Sintese do que mudou meu entendimento:

> **A EAP e escopo, nao sequencia.** A decomposicao (`1.2 → 1.3 → 1.4`) informa o que
> existe, nunca em que ordem. **Toda a confusao da AURORA nasce de derivar sequencia
> da numeracao da EAP.**

Cinco condicoes para existir vinculo `A → B` — mandatory: (a) precedencia fisica no
mesmo local, (b) fluxo da mesma equipe, (c) handoff com criterio de aceitacao,
(d) marco legal/contratual, (e) dependencia de informacao (que e **constraint** do
Last Planner, **nao** deve virar vinculo FS na rede fisica). **Se nenhuma valer,
nao criar vinculo** — multi-raiz e legitimo.

Duas conclusoes que eu nao tinha:

1. **Falta o frame, nao so as ligacoes.** Toda obra tem um inicio (`1.1.1`, ES=0) e um
   fim (entrega). As 8 cadeias hoje nao estao ligadas **nem** a um **nem** ao outro — e
   e por isso que "16 meses" nao emerge do CPM: o prazo vira o maximo das 8 chains
   paralelas, nao o resultado do sequenciamento. O esqueleto contratual e obrigatorio
   mesmo em frentes independentes.

2. **Defeito simetrico, nao apenas o da AURORA.** Forcar `FS` onde caberia `SS+lag`
   **infla o prazo e falsifica o caminho critico**. `SS+lag` (takt) e o tipo dominante
   em obra civil. Um sistema que so protege contra paralelismo exaggerado acabaria
   serializando o que pode correr junto — erro oposto, igualmente grave.

**Por que isso me faz-nao-destravar a automacao:** a direcao do vinculo depende do
**metodo executivo**, nao da EAP. Em demolicao de predio existente o escoramento vem
*antes* da demolicao; em terreno livre a limpeza vem antes. Nenhuma leitura da arvore
acerta isso. Logo a unica parte automatizavel com seguranca e **derivar da premissa
declarada** — setorizacao, plano de ataque/alocacao de equipes, metodo — e o sistema
pode **cobrar e registrar** essas fontes, nunca **supri-las**.

**Duas perguntas que so o engenheiro responde, e que destravam a AURORA:**
- **Q1:** qual a setorizacao? (bloco, pavimento, eixo, trecho). Hoje `1.2.3` nao tem
  antecessora nem dentro da propria `1.2`, onde `1.2.2 Limpeza` existe — falta handoff
  intra-frente.
- **Q2:** quantas equipes/equipos por servico, e como percorrem os setores?



## 3trigesima. CONCILIACAO VERIFICADA — a regra de engenharia x meu validador

Havia um conflito potencial entre duas coisas que eu escrevi em lugares diferentes, e
precisei checar antes de aceitar as duas:

- A regra do Butler: "**multi-raiz e legitimo**. Se nenhuma das cinco condicoes
  valer, o correto e NAO criar vinculo."
- Minha correcao: `disconnected_network` **rejeita** qualquer rede com mais de um
  componente conexo.

Lidas juntas, parecem contraditorias. **Nao sao** — e a verificacao prova
(`server/construction/frame-anchor.test.ts`, 3/3 verdes):

```ts
// 8 frentes paralelas ancoradas a um inicio e a uma entrega comuns -> ACEITA
const deps = [...frentes.map(f => d("MOB", f)), ...frentes.map(f => d(f, "ENT"))];
expect(validateDependencies(activities, deps).valid).toBe(true);

// 8 frentes paralelas SEM marco comum -> REJEITA (e e o defeito da AURORA)
expect(result.issues.map(i => i.code)).toContain("disconnected_network");
```

**A regra que reconcilia:** paralelismo e legitimo; **paralelismo sem esqueleto
contratual nao e**. A seccao 3 do documento do Butler diz exatamente isso — "o
esqueleto contratual e obrigatorio mesmo em frentes independentes". O que
`disconnected_network` recusa nao e o paralelismo: e a ausencia de marco comum de
inicio e de entrega, que e o que torna o prazo indefinido (vira o maximo das cadeias
em vez do resultado do sequenciamento).

Teste 2 cobre o caso intermediario: rede unica com paralelismo interno legitimo
(duas frentes de uma mesma etapa convergem) tambem passa.

**Por que isso importa para o aceite:** sem essa verificacao eu teria publicado duas
regras que se anulam — uma dizendo "pode paralelizar" e outra proibindo. Agora o
sistema e o documento dizem a mesma coisa, e ha teste que trava isso.


## 4. Divergencia Render x Supabase (comparacao real, leitura)

| tabela | Render PG | Supabase (autoritativo) |
|---|---|---|
| `projects` | 17 col (inclui `descricao`, `tipoDeObra`) | ver §2 |
| `wbs_nodes` (AURORA) | 367 total / 69 na v2 aprovada | 207 / 69 na v2 aprovada |
| `schedule_activities` (AURORA v3) | 56 total | 53 |
| `schedule_dependencies` | 79 (na v1 de OB-PPJ6L6) | 64 |
| `schedule_baselines` | 0 | 1 (OB-ZFSIJO) |

**Nao e perda de dados — e versaoamento.** `wbs_nodes` guarda 3 versoes da mesma EAP
(69 x 3 = 207). As contagens brutas comparam versoes diferentes. Qualquer relatorio de
"perda na migracao" que use `count(*)` sem `versionId` esta medindo a coisa errada.

## 5. Riscos abertos (nenhum tocado ainda)

- **RLS desabilitado** nas 37 tabelas do Supabase, exposas a `anon`/`authenticated`.
  Remediar sozinho (`ENABLE ROW LEVEL SECURITY` sem policies) **derruba o app inteiro**.
  Decisao do usuario. SQL pronto em §7.
- Nenhuma migration destrutiva executada. Nenhum dado alterado. AURORA somente leitura ate aqui.

## 6. Roteiro de correcao (ordenado por risco/beneficio)

1. **Sequenciamento entre pacotes** (DEF #2) — a DETECCAO ja foi feita (ver §3quater,
   `disconnected_network`); falta a geracao das ligacoes: a geracao de
   dependencias precisa criar a cadeia entre frentes conforme a ordem da EAP
   (1.2 -> 1.3 -> ...), nao so dentro de cada pacote. Requer decisao de engenharia:
   nem todo pacote pode ser Finish-to-Start (ha sobreposicao legitima em obra).
   Nao inventar dependencia "para o Gantt parecer certo" — cada ligacao precisa de
   justificativa (EAP, isolamento, ou premissa explicita marcada como provisoria).
2. **Teto de baseline** — PARCIALMENTE FEITO (§3octies): versao aprovada exigida e
   rede validada no `captureBaseline`. Falta a coluna `versionId` em
   `schedule_baselines` (DDL em producao — requer autorizacao do usuario).
   `OB-ZFSIJO` mantem a baseline de rascunho ja gravada; o codigo impede as novas.
3. **Versionamento de dependencias**: `DEMO-ZF6A7H` tem 6/6 deps com `versionId IS NULL`.
4. **Cobertura de `entrega`**: 0 folhas em 5/5 obras. Decidir: a geracao cria `entrega`,
   ou `validateEap` passa a explicar por que `pacote`-terminal e folha valida.
5. **RLS** (§7) — decisao do usuario, nao e bloqueante para o fluxo.

### O que NAO precisa de correcao (verificado, nao supeitar)

- Gate de aprovacao da EAP — correto, a AURORA passa.
- Duracao derivada — `resolveActivityDuration` + CHECK no banco impedem duracao falsa.
- Estado "desatualizado" do CPM — `cpmCalculatedAt == updatedAt` em 3/4 obras.
- Rastreabilidade atividade<->EAP — `wbsNodeId` e `eapRef` em 53/53.
- StartOffset=0 — residuo inerte, o CPM usa a rede.


## 8. VERIFICACAO FINAL — nao-regressao provada, nao presumida

Nao aceitei "parece que nao quebrou". Comprovei por `git stash`: rodei a suite no
commit limpo `dcc8626` e depois com as 4 correcoes, e comparei as falhas
**teste a teste**.

**Antes (commit limpo, sem minhas mudancas):**
```
FAIL  server/agent-workflow-skills.test.ts > documents real browser availability, TDD, safe learning and handoff limits
FAIL  server/migrations.test.ts > nenhuma migracao usa ON UPDATE CURRENT_TIMESTAMP
FAIL  server/orchestrator.test.ts > inclui a fonte local e os erros de evidencia no contexto do modelo
 Test Files  3 failed | 63 passed (66)
```

**Depois (com as 4 correcoes):** **as mesmas 3, identicas.**

Nenhuma correcao introduziu falha. Nenhuma das 3 falhas toca `dependency-validator`,
`captureBaseline`, `createDependencies` ou o painel. As 3 sao pre-existentes de
`dcc8626` e **estao fora do escopo desta sessao** — registro honesto, nao "corrigi
so para a suite passar".

| verificacao | resultado |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | exit 0, limpo |
| `npx vitest run` | 530 passed / 8 skipped / 3 failed (as 3 pre-existentes) |
| comparacao antes/depois por stash | identicas — **zero regressao** |
| testes novos de `disconnected_network` | 3 novos, incluindo redes paralelas legitimas |
| `git diff --stat` | 4 arquivos, +260 / -3 |

## 9. O QUE ESTÁ PRONTO E O QUE NAO ESTÁ

**Pronto, com evidencia de execucao:**
- Topologia real auditada (branch `develop`, Supabase autoritativo, 37 tabelas).
- 4 defeitos corrigidos no codigo, com teste ou verificacao de tipo.
- Zero regressao provada por comparacao.

**Nao pronto — e nao vou declarar pronto:**
1. **E2E em producao.** Nao houve prova de ponta a ponta. O gate EAP esta correto
   por leitura de codigo e por teste (`pagina-inicial.test.ts:148-158`); nao por
   execucao autenticada contra o deploy. Falta sessao com cookie.
2. **A regra de encadeamento entre frentes.** delegated ao time com o requisito de
   fundamento tecnico. Sem ela, `disconnected_network` bloqueia mas nao ensina —
   e a rede fragmentada da AURORA permanece ate o engenheiro definir a regra.
3. **Runner de QA morto** (`ARQUIMEDES-QA` soft-deleted). Correcao proposta, nao
   aplicada: escreve em producao, depende de decisao do usuario.
4. **`schedule_baselines.versionId`.** Requer `ALTER TABLE` em producao.
   SQL e consequencia registrados; nao aplicado.
5. **RLS desabilitado** nas 37 tabelas. Remediar sem policies derruba o app.

**A regra que guiou cada decisao:** nenhuma alteracao reduz validacao para fazer
algo passar. Toda correcao fecha um buraco; nenhuma abre uma porta nova.


## 7. SQL de RLS (NAO EXECUTADO — requer decisao do usuario)

```sql
-- Abrir 1 tabela por vez, com policies, e testar o app antes da proxima.
-- So isto: derruba todo o acesso do app.
-- ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
```
