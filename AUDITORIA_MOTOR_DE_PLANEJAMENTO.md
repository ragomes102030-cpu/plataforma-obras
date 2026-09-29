# AUDITORIA DO MOTOR DE PLANEJAMENTO

> **Data:** 29/09/2026 · **Escopo:** diagnóstico apenas. **Nada foi implementado.**
> Fontes analisadas:
> 1. `ARES_MODELO_EXCEL_NATIVO_MVP_LOB_PROFISSIONAL_FINAL_WORK.xlsx` (planilha de referência, 19 abas)
> 2. `C:\Users\Correta Engenharia\Desktop\obracopilot_excel` (projeto ARES 2.0, Python + Excel add-in)
> 3. `plataforma-obras` (sistema em produção, GitHub + Railway, TypeScript + MySQL)
> 4. MCPs de obra (`cronograma`, `eap`, `gantt-lob`) conectados ao ambiente

---

## SUMÁRIO EXECUTIVO

Três conclusões que mudam a decisão:

1. **Você já tem o motor determinístico escrito.** `obracopilot_excel/backend/Agent/planning/engine.py`
   (324 linhas) implementa duração, calendário, FS/SS/FF, lag, ciclos e Gantt derivado, com erros
   estruturados e sem Excel. Não é protótipo: é a FASE 33.43 do ARES 2.0, com 76 suítes de teste.
   **O sistema em produção não usa nada disso** — tem o seu próprio motor, menor, e com um bug.

2. **O motor existente contradiz a decisão que você já congelou.** O ARES 2.0 congelou
   *"PLANEJAMENTO A2: datas como fonte de verdade (DURACAO = FIM−INÍCIO+1 calculada)"*.
   O `engine.py` faz o oposto: duração é entrada (explícita ou `Q/P`) e as datas saem dela.
   O código não implementa a decisão congelada. **Ver GAP-01 — é a decisão que trava tudo.**

3. **A planilha de referência não implementa CPM.** As abas `CAMINHO CRÍTICO` e `CONTROLE` estão
   vazias com o texto *"estrutura criada na FASE 02; aguarda modelagem"*. A `REDE` tem estrutura
   mas zero fórmulas. Não existe comportamento de CPM para "reproduzir" — ele precisa ser
   **escrito**, e o padrão já existe: `shared/cpm.ts` no sistema atual e o MCP `cronograma`.

Além disso, encontrei **um bug ativo em produção** (`calculateCpm` descarta as restrições de data),
**cálculo de data no frontend** (o que a regra principal proíbe), e **quatro implementações
parciais da mesma matemática** em três bases de código diferentes.

---

## 1. ARQUITETURA ATUAL

### 1.1 `plataforma-obras` (o sistema em produção)

| Camada | Stack | Entrada |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind + shadcn/ui + Recharts | `client/src/` |
| Backend | Node 22 + Express + tRPC + Drizzle ORM | `server/` |
| Banco | MySQL 8 (Railway), 33 tabelas + journal do drizzle | `drizzle/schema.ts` |
| Autenticação | OAuth GitHub + sessão em cookie | `server/_core/` |
| MCP | `cronograma`, `eap`, `gantt-lob` (servidores externos, com store próprio) | config do ambiente |

**Módulos de visualização (frontend):** `Home.tsx` (1.628 linhas, painel com abas), `EapView`,
`PlanningView`, `GanttView` (452), `ProductionView` (514), `MedicaoView`, `FrentesView`,
`BudgetView` (495), `CatalogView`, `GraficosView` (802), `FormulasView`, `AgentView`.

**Backend:** `server/routers.ts` com **4.859 linhas** — um único arquivo tRPC com todos os
procedures. `server/orchestrator.ts` (588) coordena agentes. `server/agent-execution.ts` (412).

**Motores puros já existentes (`shared/`, sem banco/rede/relógio):**

| Arquivo | Linhas | O que faz |
|---|---|---|
| `shared/cpm.ts` | 205 | CPM completo: ES/EF/LS/LF, folga total e livre, caminho crítico, `mustStartOn`, `finishNoLaterThan`, FS/SS/FF/SF, lag, detecção de ciclo por Kahn |
| `shared/work-calendar.ts` | 243 | Calendário: padrão semanal, feriados, exceções, índice de dia útil |
| `shared/eap-engine.ts` | 701 | Geração de EAP a partir do catálogo SEINFRA (determinístico) |
| `shared/price-sources/` | — | Importação de base oficial e matching de preço |
| `server/construction/cpm-calculator.ts` | 60 | Wrapper de validação sobre `calculateCpm` |
| `server/construction/dependency-validator.ts` | 101 | Valida a rede antes do CPM |
| `server/construction/eap-validator.ts` | 174 | Auditoria da árvore EAP |

### 1.2 `obracopilot_excel` — ARES 2.0 (o motor determinístico que você já tem)

| Arquivo | Linhas | O que faz |
|---|---|---|
| `Agent/planning/engine.py` | 324 | **`PlanningEngine`**: Q→P→D→calendário→datas, FS/SS/FF, lag, ciclo (DFS), ordem topológica (Kahn) |
| `Agent/planning/calendar.py` | 219 | `PlanningCalendar`: dias úteis, feriados, data-base, premissa registrada; `day_offset_workdays` |
| `Agent/planning/models.py` | 215 | `PlanningActivity`, `PlanningProject`, validações, `PlanningError` |
| `Agent/planning/gantt.py` | 120 | `GanttBuilder`: Gantt derivado, escala semanal ancorada na segunda |
| `Agent/planning/eap.py` | 216 | Árvore EAP de primeira classe (`EapTree`, `EapItem`) |
| `Agent/production/calculations.py` | 111 | `total_produzido`, `saldo_producao`, `saldo_contratual`, `%produzido`, `%medido`, `valor_medido`, acumulados |
| `Agent/production/store.py` | 372 | Persistência de produção |
| `Agent/obra/padrao.py` | 564 | Modelo padrão do domínio (cadastro, EAP, serviços) |
| `Agent/obra/cadastro.py` | 494 | Locais e tipologias |
| `backend/tests/` | 76 suítes | Testes de domínio |

Estado declarado em `CONTINUAR_ARES.md` (24/08/2026): concluído até **PLANEJAMENTO**. Próxima aba:
**REDE**, depois CAMINHO CRÍTICO → GANTT → CONTROLE → INDICADORES. Projeto em pausa.

### 1.3 MCPs de obra

Servidores externos com **store próprio e dados reais** — o MCP `cronograma` tem 4 baselines
persistidas, incluindo `"Baseline Piemarta - Set 2026"`. O skill `eap-orchestration` declara que
eles implementam CPM (`calcular_caminho_critico`) e LOB (`calcular_linha_balanco`) segundo Mattos.
**Não consegui auditar o código-fonte deles a partir daqui** — ver GAP-08.

---

## 2. BANCO DE DADOS

33 tabelas. As de planejamento, com os campos que importam:

### 2.1 `schedule_activities` — **a atividade de cronograma**

```
id, projectId, wbsNodeId, externalId, eapRef, wbsCode, name, phase,
startOffset(int), durationDays(int),
plannedQuantity(decimal 14,3), productivity(decimal 14,3),
budgetItemId, progress(int %), status(enum),
critical(int), earlyStart, earlyFinish, lateStart, lateFinish,
totalFloat, freeFloat,                       ← inteiros, dias RELATIVOS
mustStartOn(timestamp), finishNoLaterThan(timestamp),
cpmCalculatedAt, versionId → project_plan_versions, sortOrder
```

Observações:
- **Duração é `int` em dias relativos** (índice de dia útil), não data. Datas ficam em
  `startOffset`/`earlyStart`, que são **índices**, não timestamps.
- `earlyStart`/`lateStart`/folgas coexistem com `mustStartOn`/`finishNoLaterThan`, que são
  **timestamps**. Duas unidades no mesmo grupo de campos — ver GAP-04.
- Não há `dataInicio`/`dataFim` reais. Não há vínculo a `servicoId` (só `budgetItemId` e `eapRef`).
- Não há `teamId`/`equipeId`. Não há `localId`/`frontId`. **A LOB por serviço do modelo ARES é
  impossível hoje** — ver GAP-02.

### 2.2 `schedule_dependencies` — **a rede**

```
id, projectId, predecessorId, successorId, type(enum FS|SS|FF|SF), lag(int)
```

Já é tabela de relação, não campo na atividade. Suporta os 4 tipos. **Não tem** `origemDaRegra`
(exigida pela `REDE` da referência) nem `equipeOrigem`.

### 2.3 Demais tabelas de planejamento

| Tabela | Papel | Observação |
|---|---|---|
| `wbs_nodes` | EAP | `code`, `name`, `level`, `nodeType`, `parentId`, `externalId` (código SEINFRA), `unit` |
| `projects` | Obra | `plannedStart`, `plannedFinish` (timestamps), `status`, `progress`, `baseReferencia` |
| `production_fronts` | Frente | `code`, `name`, `location` (texto), `status` |
| `production_teams` | Equipe | `name`, `trade`, `memberCount`, `active` — **sem `code`** |
| `production_units` | Unidade de medição | `code`, `name`, `unitType` |
| `production_entries` | Produção diária | `frontId`, `teamId`, `unitId`, **`activityId`**, `productionDate`, `quantity`, `measurementUnit`, `status` |
| `planning_resources` | Recurso | `resourceType`, `unit`, `capacityPerDay`, `costPerDay` |
| `activity_resource_allocations` | Alocação | unique(`activityId`,`resourceId`), `quantity`, `productivity` |
| `schedule_baselines` / `_items` | Baseline | congela o planejamento |
| `work_calendars` | Calendário | **`weekPattern` JSON**, unique por `projectId` |
| `calendar_exceptions` | Exceção | feriado/ponto |
| `budget_versions` / `budget_items` | Orçamento | `wbsNodeId`, `code`, `quantity`, `unitPrice` |
| `price_catalogs` / `price_items` | Catálogo SEINFRA | `notes` guarda a trilha da planilha oficial |
| `service_compositions` / `composition_components` | Composições | existe, mas **sem importador** |

### 2.4 Fontes conflitantes da verdade (achado central)

| Dado | Onde compete | Situação |
|---|---|---|
| **Duração** | `schedule_activities.durationDays` (int) | é entrada do CPM. A referência diz que é **derivada** das datas. Não há outro campo. |
| **Datas** | `startOffset`, `earlyStart` (int relativo) + `projects.plannedStart` (timestamp) | 3 representações de "quando" |
| **Predecessora** | `schedule_dependencies` (tabela) | **boa notícia:** fonte única e correta |
| **%Real** | `schedule_activities.progress` (int) **e** derivado de `production_entries` | **conflito real:** o frontend e a planilha legacy tratam `progress` como digitado; a referência exige derivado da produção |
| **Calendário** | `work_calendars.weekPattern` (banco) **vs** `defaultCalendar(ano)` (código) | o CPM **ignora o banco** — GAP-03 |
| **EAP ↔ Serviço** | `wbs_nodes.externalId` (código SEINFRA) | fonte única, boa |
| **Preço** | `price_items` (catálogo) **vs** `budget_items.unitPrice` | duplicado por design (contratado × referência) |
| **Rede / predecessoras** | `schedule_dependencies` **vs** MCP `cronograma` (store próprio) | **duas bases com dados reais** — GAP-08 |
| **Atividade** | `schedule_activities` **vs** `tbPlanejamento` + `tbPlanejamentoLegado` (planilha) **vs** `PlanningActivity` (Python) | 3 modelos |

---

## 3. A PLANILHA DE REFERENCIA, ABA POR ABA

A planilha é declarada como *"modelo padrão"* construída em fases. Ela própria marca o que
**não** foi implementado — isso é evidência, não omissão minha:

| Aba | Estado real | Observação da própria planilha |
|---|---|---|
| `DASHBOARD` | 7 fórmulas | progressos **digitados** (linhas 14-24) |
| `CADASTRO` | 0 fórmulas | 224 locais hierárquicos (torre→pavimento→apto) |
| `EAP` | 85 fórmulas | 19 disciplinas; *"Nunca usar Torre/Pavimento/Apartamento como nível"* |
| `ORÇAMENTO` | 104 fórmulas | A2: EAP→SERVIÇO→ITEM→COMPOSIÇÃO→RECURSOS→CUSTO→BDI→PREÇO→VALOR |
| `SERVIÇOS` | 55 fórmulas | `SERVIÇO = EAP × FRENTE × LOCAL` |
| `PLANEJAMENTO` | 165 fórmulas | **dois modelos convivendo** (aba abaixo) |
| `FRENTES` | 16 fórmulas | 16 frentes, 6 `Descontinuada` (histórico preservado) |
| `REDE` | **0 fórmulas** | 18 elos com `ORIGEM DA REGRA`: R1, R1-ATIVO, R1-SUBST, **R6 = mesma EQUIPE_ID** |
| `LINHA DE BALANÇO` | **944 fórmulas** | a mais pesada; `SUMPRODUCT` de sobreposição |
| `CAMINHO CRÍTICO` | **0 fórmulas, 0 linhas** | *"estrutura criada na FASE 02; aguarda modelagem"* |
| `GANTT` | 0 fórmulas | escala mensal; cabeçalho com seriais Excel **fora de ordem** (46055 antes de 46143) |
| `RECURSOS` | 0 fórmulas | recurso → equipe → serviço |
| `PRODUÇÃO` | 117 fórmulas | `DESVIO = PRODUZIDA − PREVISTA`; `ACUMULADO` por `SUMIF` |
| `MEDIÇÃO` | 81 fórmulas | `VALOR MEDIDO = MEDIDO × PREÇO`; acumulado por `SUMIF` |
| `CONTROLE` | **0 linhas** | *"aguarda modelagem"* |
| `INDICADORES` | 6 fórmulas | ver defeito abaixo |
| `GRÁFICOS` | 5 fórmulas | séries derivadas |
| `FÓRMULAS` | 0 fórmulas | **11 fórmulas documentais** — a matemática oficial |
| `CONFIGURAÇÕES` | 1 fórmula | *"vazio na FASE 02"*; contém fórmula BDI_TOTAL (TCU) |

### 3.1 As 11 fórmulas oficiais (aba `FÓRMULAS`)

| Nome | Fórmula | Unidade |
|---|---|---|
| Produtividade | `P = Q / H` | un/h |
| **Duração da atividade** | **`D = Q / P`** | dias |
| Percentual produzido | `%Prod = Qp / Qc × 100` | % |
| Percentual medido | `%Med = Qm / Qc × 100` | % |
| Valor medido | `Vm = Qm × P` | R$ |
| Saldo contratual | `S = Vc − Vm` | R$ |
| Custo realizado | `Cr = Qp × P` | R$ |
| Produtividade média | `Pm = Q / E` | un/colab-dia |
| Avanço planejado | `%Plan = Σ(Qi × %Pli) / ΣQi` | % |
| Saldo de produção | `Sp = Qc − Qp` | un |

A própria planilha anota (L16): *"as fórmulas são documentais (texto explicativo). Os valores das
abas são calculados pelo domínio — não por fórmulas do Excel."*

### 3.2 PLANEJAMENTO: os dois modelos

**Modelo legado (A4:O19, 15 atividades, dados reais da obra):**
`CÓDIGO | ATIVIDADE | SERVIÇO | FRENTE | LOCAL | EQUIPE | QUANTIDADE | PRODUT. | DURAÇÃO | INÍCIO | FIM | PREDECESSORA | %PLAN | %REAL | STATUS`
- `PRODUT. = QUANTIDADE / DURAÇÃO` — produtividade **derivada**, não entrada.
- Datas com fração `.125` (meio-dia). Ex.: `LOC-ATV` 46027.125 → 46038.125, duração 10.
- É esta tabela que alimenta a LOB e as estatísticas do cabeçalho.

**Modelo A2, ativo (A25:R55, `tbPlanejamento`):**
`PLANEJAMENTO_ID | TIPO_ATIVIDADE | SERVICO_ID | CODIGO_ATIVIDADE | EQUIPE_ID | DATA_INICIO_PLAN | DATA_FIM_PLAN | DURACAO_PLAN | QTD_PLANEJADA | UNIDADE | PREDECESSORA_ID | PERCENTUAL_PLAN | QTD_PRODUZIDA | PERCENTUAL_REAL | STATUS | PLANEJAMENTO_ORIGEM_ID | STATUS_SUGERIDO | OBSERVACAO`

Regras documentadas na própria planilha:
- **L33:** *"INÍCIO + FIM são a fonte de verdade. DURACAO_PLAN = FIM − INÍCIO + 1 (calculada).
  FIM anterior a INÍCIO sinaliza erro (não é mascarado)."*
- **L36:** `PREDECESSORA_ID` = um `PLAN-xxx` anterior. Ciclos de 2 nós bloqueados; *"ciclos maiores
  são limitação documentada (validação manual)"*.
- **L42:** `%REAL = QTD_PRODUZIDA ÷ QTD_PLANEJADA`, derivado da PRODUÇÃO por `SUMIFS` na janela
  da atividade. **Nunca digitado.** Produção acima do planejado mostra >100%.
- **L39:** `%PLAN` é digitado (0–100). Não confundir com executado.
- **L45:** `PLANEJAMENTO ≠ PRODUÇÃO ≠ MEDIÇÃO ≠ ORÇADO ≠ PLANEJADO ≠ SERVIÇO ≠ ATIVIDADE`
  e `QTD_PLANEJADA ≠ QTD_PRODUZIDA ≠ QTD_MEDIDA`.
- `TIPO_ATIVIDADE` ∈ {SERVIÇO, ESPECIAL, MARCO, MOBILIZAÇÃO, ADMINISTRAÇÃO}
- `PLANEJAMENTO_ORIGEM_ID` = linhagem de replanejamento (cria registro novo).

### 3.3 A fórmula da Linha de Balanço

944 fórmulas, mesma forma repetida em 12 serviços × 82 semanas:

```excel
=IF(SUMPRODUCT(
   (PLANEJAMENTO!$C$5:$C$19 = $B11)     (* serviço da atividade = serviço da linha *)
   (PLANEJAMENTO!$J$5:$J$19 <= C$9+6)   (* início da atividade <= fim da semana *)
   (PLANEJAMENTO!$K$5:$K$19 >= C$9)     (* fim da atividade    >= início da semana *)
 ) > 0, $A11, "")
```

Semântica: a célula marca o serviço se **qualquer** atividade daquele serviço **se sobrepõe** à
semana `[inícioSemana, inícioSemana+6]`. As semanas começam em 7 em 7 dias (46027, 46034, 46041…),
ancoradas no início da obra, com `WEEKNUM` só no rótulo. **Semana civil, não semana útil.**

A própria planilha declara os limites:
- `CONFLITOS` e `RITMO` no cabeçalho: **"SEM DADO"**
- *"HOJE: SEM DADO — critério e buffer ainda não definidos (**GAP**)"*
- *"Dois serviços ativos na MESMA data e MESMA frente/pavimento indicam sobreposição."*
- *"NÃO CONFUNDIR RITMO COM DURAÇÃO · Produtividade do legado (unidade/dia) não é ritmo."*
- *"PLANEJADO: faixas derivadas de INÍCIO/FIM · REALIZADO: %REAL · SEM DADO onde não houver fonte."*

### 3.4 Defeitos encontrados NA PLANILHA (não copie estes)

1. **`MEDIÇÃO` com colunas deslocadas.** O cabeçalho diz `E = CONTRATADO`, mas `E11` busca
   `UNIDADE` (`INDEX(tbServicos[UNIDADE],…)`). Com o deslocamento, `K = SALDO CONTRATUAL`
   calcula `UNIDADE × PREÇO − ACUMULADO` e `L = %MED` calcula `MEDIDO / UNIDADE`.
2. **`MEDIÇÃO!B6` rotulado "Valor medido"** é `SUMPRODUCT(QTD_CONTRATADA, PRECO_UNITARIO)` — que é
   o **valor total do contrato**, não o medido. Por isso `B7 = B5−B6 = 0`.
3. **`INDICADORES!B5`, `B6` e `B10` têm a mesma fórmula** (`SUM(VALOR_CONTRATADO)`) apesar de
   rótulos diferentes (PRODUÇÃO / MEDIÇÃO / SALDO). Só `B7` está coerente
   (`SUMPRODUCT(Q, %PLAN)/SUM(Q)/100`).
4. **`GANTT!L4` tem os seriais fora de ordem** (46055 antes de 46143) e mistura data com número.

**Conclusão:** a planilha é uma boa **especificação de domínio**, mas **não é uma fonte de
resultados numéricos**. Trazer as fórmulas dela como se fossem corretas importaria os bugs acima.

---

## 4. FONTE ÚNICA DE CADA INFORMAÇÃO

| Conceito | Fonte hoje | Veredito |
|---|---|---|
| **Obra** | `projects` | ✅ única |
| **EAP** | `wbs_nodes` (+ `externalId` = código SEINFRA) | ✅ única, boa |
| **Serviço** | ⚠️ **não existe**. `budget_items` tem `wbsNodeId` + `code` próprio | ❌ GAP-02 |
| **Atividade** | `schedule_activities` | ⚠️ única no banco, mas compete com a planilha e o MCP |
| **Quantidade** | ⚠️ `plannedQuantity` (atividade) **vs** `budget_items.quantity` **vs** `production_entries.quantity` | ❌ três nomes, uma só história |
| **Produtividade** | ⚠️ `schedule_activities.productivity` **vs** `activity_resource_allocations.productivity` | ❌ GAP-05 |
| **Duração** | `schedule_activities.durationDays` (entrada do CPM) | ⚠️ contradiz a referência |
| **Data inicial** | ⚠️ `startOffset` (relativo, int) vs `earlyStart` (relativo, int, do CPM) | ❌ GAP-04 |
| **Data final** | ⚠️ não existe; é `earlyStart + durationDays` calculado no cliente | ❌ GAP-04 |
| **Predecessora** | `schedule_dependencies` | ✅ única e correta |
| **Tipo de relação** | `schedule_dependencies.type` (FS/SS/FF/SF) | ✅ suporta os 4 |
| **Defasagem** | `schedule_dependencies.lag` (int) | ✅ |
| **Avanço** | ⚠️ `schedule_activities.progress` (digitado) | ❌ a referência exige derivado |
| **Produção** | `production_entries` | ✅ existe e é a fonte certa |
| **Frente** | `production_fronts` | ⚠️ não ligada à atividade |
| **Local** | ⚠️ não existe como entidade; `production_fronts.location` é texto livre | ❌ GAP-06 |
| **Equipe** | `production_teams` (sem `code`) | ⚠️ não ligada à atividade |
| **Calendário** | ⚠️ `work_calendars` existe; o CPM usa `defaultCalendar(ano)` | ❌ GAP-03 |
| **Medição** | ⚠️ não existe tabela de medição | ❌ GAP-07 |
| **Indicadores** | ⚠️ não existe; o frontend monta na tela | ❌ GAP-09 |
| **Caminho crítico** | ✅ `shared/cpm.ts` (ES/EF/LS/LF/TF/FF/critical) | ✅ motor pronto |

---

## 5. FLUXO DE DADOS ALVO

```
DADOS DA OBRA
  ↓
EAP  (wbs_nodes)
  ↓
SERVIÇO  = EAP × FRENTE × LOCAL        ← GAP-02, não existe
  ↓
ATIVIDADE  (1 serviço → N atividades)
  ↓
QUANTIDADE PLANEJADA + PRODUTIVIDADE
  ↓
DURAÇÃO            ← GAP-01: entrada ou derivada?
  ↓
PREDECESSORAS  (schedule_dependencies)
  ↓
REDE  (Kahn → ordem topológica)
  ↓
CPM  (ES/EF → LS/LF → folgas → crítico)
  ↓
DATAS  (índice de dia útil → data, via calendário)
  ↓
GANTT   (derivado, não calculado)
LINHA DE BALANÇO  (serviço × semana)
INDICADORES
```

Cada seta é **uma dependência de recálculo** e precisa ter um dono no backend. Hoje **nenhuma**
dessas setas dispara recálculo automático.

---

## 6. MOTOR DE DURAÇÃO

### A fórmula e a armadilha das unidades

`D = Q / P` só produz dias se **Q** e **P** compartilharem a unidade:

| Variável | Unidade na planilha | Onde está no sistema |
|---|---|---|
| `Q` | unidade do serviço (`m²`, `m³`, `pt`, `un`, `vb`) | `production_entries.measurementUnit` |
| `P` | un/dia (mão de obra) ou un/h | ⚠️ sem unidade declarada |
| `D` | **dias úteis** | `durationDays` (int, sem unidade explícita) |

**Três riscos concretos, todos presentes hoje:**

1. **Misturar `un/h` com `un/dia`.** A `FÓRMULAS` define `P = Q / H` (por **hora**) e
   `D = Q / P` (por **dia**). Se `P` for productivity por hora, `Q/P` dá **horas**, não dias.
   A referência não tem campo de unidade de produtividade. **GAP-10.**
2. **Arredondamento.** O `engine.py` faz `ceil(Q/P)` e registra a premissa. O `shared/cpm.ts`
   **exige** `duration` inteiro e **lança** se não for. As duas implementações divergem no
   tratamento de `Q/P` fracionário.
3. **Divisão por zero.** `engine.py` trata isso como erro estruturado `PRODUCTIVITY_ZERO` e se
   recusa a inventar. `shared/cpm.ts` não tem o conceito de produtividade — ele só consome
   duração. O sistema atual nunca calcula duração a partir de Q/P.

### Decisão pendente (GAP-01)

| | Evidência A: datas são a verdade | Evidência B: duração é a entrada |
|---|---|---|
| Planilha `PLANEJAMENTO!L33` | "INÍCIO + FIM são a fonte de verdade. DURACAO = FIM − INÍCIO + 1" | |
| `CONTINUAR_ARES.md` §4 | "PLANEJAMENTO A2: datas como fonte de verdade (DURACAO = FIM−INÍCIO+1 calculada)" | |
| `PlanningActivity` | tem `data_fim` (comentado *"MVP: calculada"*) | tem `duracao` (entrada) |
| `engine.py` | | `duracao` explícita tem **prioridade**; senão `ceil(Q/P)` |
| `FÓRMULAS` | | `D = Q / P` como fórmula oficial |
| Legado `A4:O19` | | `PRODUT. = QUANTIDADE / DURAÇÃO` (derivada!) |

**Não escolho aqui.** As duas são defensáveis e a escolha muda a interface inteira:
com datas como verdade, quem digita duração? Com duração como verdade, quem valida a data
informada? Ver seção 15.

---

## 7. MOTOR DE DATAS

### A semântica do calendário (medida em `calendar.py`)

`day_offset_workdays(d, n)`: `n=0` → primeiro dia útil ≥ `d`; `n=1` → o próprio `d` se for útil;
`n=2` → o próximo útil. Logo:

```
fim = day_offset_workdays(inicio, duracao)
```
com `duracao=1` → `fim = inicio`; `duracao=10` → `fim` é o 10º dia útil **contando o início**.
Ou seja, **fim é inclusivo**, exatamente como a planilha (`FIM = INÍCIO + D − 1`). ✅

As três relações de dependência, conferidas:

| Tipo | Regra no `engine.py` | Correto? |
|---|---|---|
| FS | `inicio_suc = day_offset(fim_pred, 2 + lag)` — próximo dia útil após o fim, mais folga | ✅ |
| SS | `inicio_suc = day_offset(inicio_pred, 1 + lag)` | ✅ |
| FF | `fim_suc ≥ day_offset(fim_pred, 1 + lag)`, `inicio_suc = fim_suc − dur + 1` | ✅ |

### Conflito com o sistema atual

`shared/work-calendar.ts` opera em **índices de dia útil** e o sistema converte índice→data no
**cliente** (`dateAtWorkCalendar`). O `calendar.py` do ARES opera em **`datetime.date` reais**.
São duas representações do mesmo conceito, em duas linguagens, com semântica de fim idêntica.
Escolher uma é pré-requisito de qualquer coisa (GAP-11).

---

## 8. MOTOR DE REDE

**Estado atual — bom.** `schedule_dependencies` é tabela de relação com
`predecessorId`, `successorId`, `type` (FS/SS/FF/SF), `lag`. Suporta múltiplas predecessoras
por sucessora. Não é campo na atividade. ✅

**Faltando, segundo a referência:**

1. **`ORIGEM DA REGRA`** (coluna `F` da `REDE`): `R1` (precedente explícito do legado),
   `R1-ATIVO` (de `PREDECESSORA_ID`), `R1-SUBST` (herdada por substituto),
   **`R6` = mesma `EQUIPE_ID`**. A `R6` é uma dependência **por recurso**, não declarada pelo
   usuário: duas atividades com a mesma equipe não podem se sobrepor. **O sistema atual não tem
   `teamId` na atividade**, então nem pode detectá-la.
2. **Ciclo de tamanho > 2.** A planilha declara isso como limitação. `shared/cpm.ts` já detecta
   qualquer ciclo (Kahn, `order.length !== activities.length` → lança). `engine.py` também
   (DFS com cores). **Portanto aqui o sistema está à frente da referência.**

---

## 9. MOTOR CPM

### 9.1 O motor existe e é bom

`shared/cpm.ts` (205 linhas, puro, sem relógio/rede/banco) implementa:
- ordenação topológica (Kahn) com fila ordenada por id → determinística
- `ES/EF` com FS/SS/FF/SF e lag
- restrições `mustStartOn` (piso) e `finishNoLaterThan` (teto)
- `LS/LF` em marcha à ré
- folga total `LS − ES`, folga livre `min(ES_sucessora) − EF`
- `critical = totalFloat <= 0`, `infeasible = totalFloat < 0`
- `criticalPath` ordenado, `infeasibleActivities`
- valida: id duplicado, duração não inteira, dependência para atividade inexistente,
  auto-ciclo, lag não inteiro, ciclo na rede

`server/construction/cpm-calculator.ts` embrulha com validação prévia e converte
folga negativa em issue `cpm_constraint_conflict`. **Duas camadas, uma implementação — não é
duplicação.** ✅

### 9.2 BUG ATIVO EM PRODUÇÃO — restrições descartadas

`server/routers.ts:3193` (procedure `calculateCpm`):

```ts
const enrichedActivities = activities.map(a => ({
  ...a,
  mustStartOnDay: a.mustStartOn ? indexOf(calendar, startIso, localIso(a.mustStartOn)) : undefined,
  finishNoLaterThanDay: a.finishNoLaterThan ? indexOf(calendar, startIso, localIso(a.finishNoLaterThan)) : undefined
}));

const result = calculateDeterministicCpm(activities, dependencies);  // ← activities, NÃO enrichedActivities
```

`enrichedActivities` **não é usada em lugar nenhum depois disso** (verificado por busca no arquivo
inteiro: uma única ocorrência, linha 3193). Consequência: **`mustStartOn` e `finishNoLaterThan`
nunca chegam ao CPM**. As colunas existem no schema, a UI oferece a restrição, o cálculo é feito
e jogado no lixo. A restrição não é "fracamente aplicada" — ela é **inexistente**, sem erro e sem
aviso. Isso é a pior classe de defeito: silencioso.

### 9.3 Segundo defeito no mesmo procedimento

```ts
const calendar = defaultCalendar(year);   // ano de plannedStart
```
O procedimento monta um calendário **padrão do ano** e ignora `work_calendars.weekPattern` e
`calendar_exceptions` — que existem no banco, têm migration e não têm nenhum consumidor no CPM.
Duas fontes de verdade de calendário, e a persistida perde.

### 9.4 Terceiro ponto: o CPM é manual

`calculateCpm` só roda quando o usuário clica em **"Calcular CPM"** (`PlanningView.tsx:54`).
Não há recálculo ao alterar quantidade, produtividade, duração ou predecessora. Enquanto
`cpmCalculatedAt` não for atualizado, `earlyStart`/`critical` na tela são de uma execução
antiga. Isso é a raiz do sintoma "não está funcionando do jeito que quero".

---

## 10. MOTOR GANTT

**Regra:** o Gantt representa, não calcula.

O `gantt.py` do ARES já faz isso corretamente: `GanttBuilder.build()` recebe atividades **já
calculadas** e só monta escala semanal ancorada na segunda-feira, filtrando o que tem data.

No sistema atual, `GanttView.tsx` (452 linhas) faz as duas coisas:

| Linha | O que faz | Problema |
|---|---|---|
| `GanttView.tsx:131` | `new Date(plannedStart).getTime()` | converte no cliente |
| `GanttView.tsx:139` | `defaultCalendar(new Date(projectStart).getFullYear())` | **calendário padrão no cliente** quando o banco não tem |
| `GanttView.tsx:145` | `dateAtWorkCalendar(calendar, localIso(...), o)` | ⚠️ certo no método, mas o calendário é o errado |
| `Home.tsx:515` | `Math.round((index / 12) * weekCount) * 7 * 86400000` | escala com `12` e `7` literais |
| `Home.tsx:530` | `Math.round((Date.now() - projectStart) / 86400000)` | **relógio do cliente** contra meia-noite local |
| `Home.tsx:547` | `projectStart + end * 86400000` | dias corridos, **ignora o calendário** |
| `Home.tsx:608-612` | input de data → `earlyStart` | **o cliente escreve num campo de saída do CPM** |

`86400000` aparece 5 vezes. `Date.now()` é UTC em ms; `plannedStart` é meia-noite local.
A diferença entre as duas é o **offset de fuso** — e `new Date(string)` sem `Z` é interpretado
na hora local, enquanto o MySQL devolve timestamp. A causa de "às vezes a data está errada" está
aqui, e ela depende de **onde o navegador está**.

---

## 11. MOTOR LINHA DE BALANÇO

**Referência:** serviço × semana, marcada por sobreposição de qualquer atividade (§3.3).
**Sistema atual:** a LOB do `Home.tsx` é **por atividade**, não por serviço, e a escala é um
truque de gráfico (`(index/12)*weekCount*7*86400000`). Não há motor. Não há backend. Não há
tabela que a suporte (§2.4: sem `servicoId`, sem `localId` na atividade).

O MCP `gantt-lob` declara `calcular_linha_balanco` e `balancear_ritmos_lob` (Matttos, cap. 20.4/20.5)
— **código não auditado daqui** (GAP-08). Se for o mesmo Mattos, é reutilizável.

---

## 12. MOTOR DE PRODUTIVIDADE

O ARES já tem `Agent/production/calculations.py` com funções puras e documentadas:

| Função | Fórmula | Regra de borda |
|---|---|---|
| `total_produzido` | `Σ quantidade` | 0 se vazio |
| `total_medido` | `Σ quantidade` | 0 se vazio |
| `saldo_producao` | `contratada − produzido` | `None` se contratado ausente |
| `saldo_contratual` | `contratada − medido` | `None` se contratado ausente |
| `percentual_produzido` | `produzido / contratada × 100` | `None` se contratado **zero** (não `Infinity`) |
| `percentual_medido` | `medido / contratada × 100` | idem |
| `valor_medido` | `quantidade × preço` | `None` se falta qualquer um |
| `producao_acumulada_por_data` | acumulado cronológico | ordena por `(data, id)` — estável |
| `medicao_acumulada_por_periodo` | acumulado por `period_end` | ordena por `(period_end, period_start, id)` |

As regras de borda são exatamente as que a referência exige ("NUNCA inventa valores;
não calculáveis viram `None`"), e `percentual_produzido` trata contratado zero como `None` em
vez de `Infinity` — o sistema atual não tem nem o problema nem a proteção, porque não calcula.

**No sistema atual:** `production_entries` existe e é a fonte certa, mas `%Real` **não é
derivado** dela. `schedule_activities.progress` é um inteiro digitado. A planilha A2 exige o
oposto (L42). Isso é GAP-09 na sua forma mais concreta.

---

## 13. REGRAS DE ARREDONDAMENTO (medidas)

| Grandeza | Regra na referência | Regra no `engine.py` | Regra no `shared/cpm.ts` |
|---|---|---|---|
| Duração | `FIM − INÍCIO + 1` (dias **civis**, `PLANEJAMENTO!H`) | `ceil(d)`, dias **úteis** | exige `int`; lança se não for |
| Data | `TEXT(...,"dd/mm/yyyy")` | `strftime("%d/%m/%Y")` | `date-fns` |
| Percentual | sem regra explícita | `round(...,2)` | — |
| Valor | sem regra explícita | `round(...,2)` | — |
| Acumulado | sem regra explícita | `round(...,4)` | — |

**Divergência de dias: civis × úteis.** A planilha A2 usa `FIM − INÍCIO + 1` sobre datas — dias
**civis**. O `engine.py` usa dias **úteis**. Para uma obra que não trabalha sábado e domingo, a
mesma duração de 10 dias vira 14 dias civis. **Nenhuma das duas está errada** — mas elas precisam
ser a mesma, e hoje não são. Ver GAP-01/GAP-11.

---

## 14. GRAFO DE RECÁLCULO

O que a regra principal exige, e o que existe:

```
alterar quantidade ──────→ duração ─→ datas ─→ CPM ─→ Gantt ─→ LOB ─→ indicadores
                                        ↑         ↑
alterar produtividade ────────────────────┘         │
alterar duração ─────────────────────────┘         │
                                                  predecessoras
alterar predecessora ─────────────────────→ rede ─→ CPM ─→ Gantt ─→ LOB
alterar calendário ───────────→ recalcula TUDO acima
lançar produção ────────────→ %Real ─→ status ─→ LOB(realizado) ─→ indicadores
lançar medição ─────────────→ %Med ─→ saldo contratual ─→ indicadores
```

**Estado real: nenhum desses gatilhos existe.** Todos os caminhos são manuais. `calculateCpm` é
um botão. Editar uma predecessora não recalcula nada. Lançar produção não mexe em `%Real`.

O que já existe e é reutilizável: `project_plan_versions` + `schedule_baselines`/`_items` dão a
vocabulário de versionamento; `project_audit_events` dá o rastro.

---

## 15. HARD CODES ENCONTRADOS

| Onde | Valor | Problema |
|---|---|---|
| `Home.tsx:110` | `Date.now()` | barra de progresso pelo relógio do cliente |
| `Home.tsx:210` | `Date.now() - minOffset * 86_400_000` | converte índice→data **no cliente**; `86_400_000` (com separador) não casa em busca por `86400000` |
| `Home.tsx:214`, `Home.tsx:908` | `defaultCalendar(ano)` | calendário padrão **no cliente** |
| `Home.tsx:515` | `Math.round((index / 12) * weekCount) * 7 * 86400000` | escala da LOB; `12` e `7` literais |
| `Home.tsx:530` | `Math.round((Date.now() - projectStart) / 86400000)` | "hoje" pelo relógio do cliente |
| `Home.tsx:547` | `projectStart + end * 86400000` | dias corridos, **ignora o calendário** |
| `Home.tsx:608` | `toLocalDate(projectStart + startDay * 86400000)` | conversão no cliente |
| `Home.tsx:612` | `Math.round((timestamp - projectStart) / 86400000)` | **o cliente escreve em `earlyStart`**, campo de saída do CPM |
| `GanttView.tsx:139` | `defaultCalendar(new Date(projectStart).getFullYear())` | calendário no cliente |
| `routers.ts:3185` | `new Date().getFullYear()` | relógio dentro de um caminho de cálculo |
| `routers.ts:3187` | `defaultCalendar(year)` | ignora o calendário persistido |
| `routers.ts:2035` | `plannedDurationDays: 14` | duração fixa no `initializePlan` |
| `routers.ts:2005` | `quantity: "1.000"`, `unit: "vb"`, `unitPrice: "0.00"` | orçamento de demonstração fixo |
| `routers.ts:2004` | `code: "01.001"` | **código que não existe na SEINFRA** — o defeito que a Onda 0.4 já corrigiu em parte |

**Contagem:** 6 ocorrências de ms-por-dia em duas grafias (`86400000` ×5 e `86_400_000` ×1 — a
separada escapa de uma busca pela primeira), 3 de `Date.now()` e 3 de `defaultCalendar()` no
cliente, todas em `Home.tsx` e `GanttView.tsx`. Nenhum motor de backend é responsável por
nenhuma delas.

---

## 16. DUPLICIDADES

| # | Duplicidade | Veredito |
|---|---|---|
| D1 | CPM: `shared/cpm.ts` + MCP `cronograma` | **Consolidar.** O MCP tem dados reais; o TS não tem consumidor além do app. Decidir morador |
| D2 | Duração: `durationDays` (int) vs `data_fim` derivado | **GAP-01**, ver seção 6 |
| D3 | Calendário: `work_calendars` vs `defaultCalendar(ano)` | **Banco ganha.** É a única fonte persistente |
| D4 | Avanço: `progress` digitado vs derivado de `production_entries` | **Produção ganha**, por decisão de arquitetura já escrita |
| D5 | Atividade: `schedule_activities` vs `tbPlanejamento` vs `PlanningActivity` | **Banco ganha.** Os outros dois viram referência/teste |
| D6 | Preço: `price_items` vs `budget_items.unitPrice` | **Não é duplicação** — referência × contratado. Manter, mas nomear |
| D7 | Produtividade: `schedule_activities.productivity` vs `activity_resource_allocations.productivity` | **GAP-05.** Provável duplicata sem dono |
| D8 | `%Real`: `progress` vs `PRODUÇÃO` | igual D4 |

**Nenhuma duplicação exige reescrita.** Todas se resolvem removendo o perdedor de um par.

---

## 17. GAPS

| ID | Falta | Onde deveria existir | Impacto | Menor alteração |
|---|---|---|---|---|
| **GAP-01** | Definição de duração: entrada ou derivada | Motor de duração | **Bloqueia** toda a cadeia | Decisão sua + 1 campo opcional |
| **GAP-02** | Entidade **SERVIÇO** | Banco | **Bloqueia** LOB por serviço e a cadeia EAP→SERVIÇO→ATIVIDADE | 1 tabela `services` + FK em `schedule_activities` |
| **GAP-03** | Consumo de `work_calendars` no CPM | `cpm-calculator` | Cronograma errado quando há feriado | Ler o banco em `calculateCpm` |
| **GAP-04** | Datas reais (timestamps) e uma única unidade | `schedule_activities` | Divergência cliente/servidor | Adicionar `plannedStart`/`plannedFinish` timestamp; manter offset como derivado |
| **GAP-05** | Unidade da produtividade | `schedule_activities` / alocação | `Q/P` errada (h × dia) | `productivityUnit` enum |
| **GAP-06** | Entidade **LOCAL** | Banco | LOB e % por pavimento impossíveis | 1 tabela `locations` (hierárquica, com `parentId`) |
| **GAP-07** | Tabela de **MEDIÇÃO** | Banco | %Med e saldo contratual impossíveis | 1 tabela `measurement_entries` |
| **GAP-08** | Código dos MCPs de obra | Fora do repositório | 4º motor, com dados reais | Localizar e avaliar antes de construir D1 |
| **GAP-09** | Tabela/derived de **INDICADORES** e `%Real` derivado | Backend | Indicadores são tela, não dado | Derivar `%Real` de `production_entries` |
| **GAP-10** | Distinção `un/h` × `un/dia` em `P` | Motor de duração | Duração errada | Ver GAP-05 |
| **GAP-11** | Uma só base de calendário (dias úteis em `date` real) | `shared/work-calendar` | Duas semânticas de fim | Reescrever `work-calendar` sobre `date`, no padrão de `calendar.py` |
| **GAP-12** | `servicoId`, `frontId`, `teamId`, `localId` na atividade | `schedule_activities` | LOB, conflito de equipe (R6), filtro por frente | 4 FKs |
| **GAP-13** | Gatilho de recálculo | Backend | Datas obsoletas na tela | Recalcular no write, transacional |
| **GAP-14** | `ORIGEM DA REGRA` na dependência | `schedule_dependencies` | Perde a rastreabilidade da R6 | 1 coluna enum |
| **GAP-15** | Critério de "HOJE" na LOB | Planilha declara GAP | Marca de hoje arbitrária | Definir com você |

**A planilha declara 4 GAPs próprios** (HOJE/buffer, CONFLITOS, RITMO, BDI_TOTAL) que continuam
abertos lá também. Não os resolvi.

---

## 18. RISCOS

| Risco | Prob. | Sev. | Mitigação |
|---|---|---|---|
| Consolidar no MCP errado e perder dados reais | média | **alta** | Auditar GAP-08 antes de mexer em rede |
| Escolher duração-derivada e quebrar a interface de datas | alta | média | Manter os dois campos; um é derivado do outro |
| Recálculo transacional deixar a atividade meio atualizada | média | **alta** | Calcular tudo em memória, gravar 1 vez |
| Fuso horário reintroduzir o bug de "data errada" | **alta** | alta | `date` local, nunca `Date.now()` no cliente |
| Expor estado de planejamento inconsistente pela API | média | **alta** | Gravar CPM + LOB + indicadores numa transação só |
| Coluna `notes` virar depósito de verdade | baixa | média | Ela guarda a trilha SEINFRA; não misturar |
| 4.859 linhas em `routers.ts`, difícil de revisar | **alta** | média | Não piorar: novos motores em `shared/`, Procedures em router próprio |

---

## 19. RAILWAY (situação atual)

| Item | Estado |
|---|---|
| Projeto | **Obras** `46b289a1…` · serviço `plataforma-obras-staging` `eac703a5…` |
| Branch de deploy | `develop` (**não** `main`) |
| Build | `railway.json` → `DOCKERFILE`, `startCommand: pnpm start` |
| Pre-deploy | `node scripts/migrate-db.mjs && node scripts/audit-schema.mjs \|\| true` |
| Banco | MySQL interno; **inalcançável de fora** (por isso a auditoria roda no pre-deploy) |
| Auditoria de schema | 356 colunas, 34 tabelas, 3/3 migrations — roda a cada deploy, **não-bloqueante** |
| Migrations | `0000_baseline` + `0001_planning` + `0002_descritivo`, aplicadas |
| `railway.json` | **depreciado** pelo Railway; funciona até 2026-12-01 |
| Commits locais | ⚠️ **3 commits à frente do remoto** (`63bbb3c`, `fe11653`, `a3f67af`) — push travado por credencial do GitHub |

**Risco de fuso no deploy:** o servidor roda com `TZ` não configurado. `routers.ts:3197` grava
`cpmCalculatedAt = new Date()` e o `calendar.py` do ARES trabalha com `date` local. Em Railway
(UTC) e no seu navegador (UTC−3) a mesma atividade pode aparecer com dias diferentes. **GAP-11
inclui fixar o fuso.**

---

## 20. DATASET DE TESTE PROPOSTO

Mínimo, determinístico, sem dados reais — espelha o ARES e cabe nas tabelas atuais:

**Obra `OBRA-TESTE-01`** — 1 obra, `plannedStart` fixa (2026-01-05), plano **sem** feriados e
**com** 1 feriado, para provar que o calendário é respeitado.

| Atividade | Serviço | Qtd | Prod. | Dur. | Pred. | Tipo | Lag |
|---|---|---|---|---|---|---|---|
| `ATV-01` Locação | (marco) | 1 | — | 5 | — | FS | 0 |
| `ATV-02` Fundação | SERV-01 | 1200 | 30 | — | ATV-01 | FS | 0 |
| `ATV-03` Estrutura | SERV-02 | 1800 | 72 | — | ATV-02 | FS | 0 |
| `ATV-04` Elétrica | SERV-03 | 8400 | 168 | — | ATV-02 | **SS** | 5 |
| `ATV-05` Pintura | SERV-04 | 6800 | 136 | — | ATV-03 | **FF** | 0 |
| `ATV-06`.Marshal | (marco) | — | — | 0 | ATV-02 | FS | 0 |
| `ATV-07` (ciclo) | — | — | — | — | ATV-07 | FS | 0 |

Casos obrigatórios: isolada · cadeia simples · múltiplas predecessoras · FS/SS/FF · defasagem ·
calendário com feriado · caminho crítico · folga · **produtividade zero** (erro, não 0) ·
quantidade zero (marco, com aviso) · alteração de Q · alteração de P · alteração de predecessora ·
ciclo · LOB.

---

## 21. COMPARAÇÃO EXCEL × SISTEMA

Mecanismo proposto (`scripts/comparar-referencia.mts`), **sem** avaliação visual:

1. Ler `tbPlanejamento` (A2) do `.xlsx` com SheetJS — mesmo caminho de leitura já usado no
   importador SEINFRA.
2. Gravar as mesmas atividades no MySQL, uma obra descartável.
3. Rodar o motor do backend.
4. Comparar campo a campo e emitir a tabela:

| Campo | Excel | Sistema | Diferença | Status |
|---|---:|---:|---:|---|
| `DURACAO_PLAN` | 26 | 26 | 0 | ✅ |
| `DURACAO_PLAN` (cívil) | 26 | 18 (útil) | **8** | ❌ GAP-01 |
| `INÍCIO` | 46237 | 46237 | 0 | ✅ |
| `%REAL` | 0 | 0 | 0 | ✅ |
| `FOLGA TOTAL` | *sem dado* | 0 | — | ⚠️ GAP (aba vazia) |

**Critério:** igualdade numérica, tolerância declarada por campo. "Parecido visualmente" não passa.
A primeira execução vai **falhar** na conversão dias-civis × dias-úteis, e isso é o resultado
honesto — é o GAP-01 aparecendo em número.

---

## 22. PROPOSTA DE ARQUITETURA MÍNIMA

**Reutilizar. Não reescrever.** Os motores já existem em Python; o que falta é a ponte.

```
shared/                      ← motores puros, sem banco/rede/relógio
  calendario.ts              ← reescrever work-calendar.ts sobre date real  (GAP-11)
  duracao.ts                 ← NOVO. Resolve GAP-01, GAP-05, GAP-10
  rede.ts                    ← ordenação topológica + detecção de ciclo (extrair do cpm.ts)
  cpm.ts                     ← EXISTE. Manter
  gantt.ts                   ← NOVO. Derivado, como gantt.py
  linha-balanco.ts           ← NOVO. Serviço × semana
  producao.ts                ← portar calculations.py (é 111 linhas)
  indicadores.ts             ← NOVO
server/
  recalcular.ts              ← orquestra: lê → calcula tudo → grava 1 transação  (GAP-13)
```

**Serviços (tabelas novas):** `services` (GAP-02), `locations` (GAP-06),
`measurement_entries` (GAP-07).
**Colunas novas:** `schedule_activities.{servicoId, frontId, teamId, localId, productivityUnit,
plannedStart, plannedFinish}` (GAP-04, GAP-05, GAP-12) · `schedule_dependencies.origemRegra` (GAP-14).

**API:** antes de criar endpoint, verificar. Hoje tudo é tRPC, e os verbos já existem
(`projects.calculateCpm`, `projects.generateFromEap`, `projects.createDependency`,
`projects.updateActivity`). A proposta é **estender** esses, não criar REST paralelo:

| Endpoint | Reaproveita |
|---|---|
| `projects.calculateCpm` | já existe → passa a usar o calendário do banco e grava LOB+indicadores na mesma transação |
| `projects.recalculatePlanning` | **novo**, ou dispara em `updateActivity`/`createDependency` |
| `projects.gantt` | **novo** (derivado) |
| `projects.linhaBalanco` | **novo** |
| `projects.indicadores` | **novo** |

**Frontend:** para de calcular. `GanttView`, `Home` (LOB) e `PlanningView` passam a renderizar o
que o backend manda. Some `86400000`, `Date.now()`, `defaultCalendar` e o input que escreve
`earlyStart`. Isso é a regra principal sendo aplicada, e é onde a sua inconsistência aparece.

---

## 23. PLANO POR FASES

| Fase | Entrega | Depende | Bloqueio |
|---|---|---|---|
| **1** | `services` + `locations` + FKs; `recalcular.ts` esqueleto | GAP-01 | **GAP-01** |
| **2** | `calendario.ts` sobre `date` real + `duracao.ts` | GAP-01, 05, 10, 11 | Fase 1 |
| **3** | `rede.ts` extraído; `origemRegra`; R6 (mesma equipe) | GAP-12, 14 | Fase 1 |
| **4** | `cpm.ts` já existe — **corrigir os 2 bugs** (restrições, calendário) | GAP-03 | nenhuma |
| **5** | Datas reais em `schedule_activities`; cliente para de converter | GAP-04, 11 | Fase 2 |
| **6** | `gantt.ts`; `GanttView` só renderiza | — | Fase 5 |
| **7** | `linha-balanco.ts`; LOB do backend | GAP-02, 12, 15 | Fase 1 |
| **8** | `producao.ts`; `%Real` derivado | GAP-09 | Fase 2 |
| **9** | `medicoes`; `indicadores.ts` | GAP-07 | Fase 8 |
| **10** | Interface consumindo tudo;Comparison com a planilha | — | 1-9 |

**Fase 4 é a mais barata e a de maior retorno**: dois bugs, nenhuma tabela nova, e o CPM volta a
obedecer restrições. Pode começar antes de qualquer decisão sobre o GAP-01.

---

## 24. TESTES DE ACEITAÇÃO

Nenhum destes passa hoje:

| # | Teste | Critério |
|---|---|---|
| T1 | `Q=100, P=10` | `D = 10` dias (ou o que o GAP-01 decidir) |
| T2 | `P=0`, sem duração | erro estruturado; **nunca** 0 silencioso |
| T3 | `Q=0` | marco, duração 0, **aviso explícito** |
| T4 | `Q=100, P=3` | fração: o arredondamento é o declarado? |
| T5 | A→B FS | `inicio_B` = próximo dia útil após `fim_A` |
| T6 | A→B FS lag 3 | `inicio_B` = anterior + 3 dias úteis |
| T7 | A→B SS / FF | ambas as restricts conferidas |
| T8 | 2 predecessoras | `ES` = máximo das restrições |
| T9 | feriado no meio | duração conta **dias úteis**, não civis |
| T10 | fim na sexta, início na segunda | `fim` inclusivo: `D = FIM − INÍCIO + 1` em dias úteis |
| T11 | caminho crítico | `totalFloat == 0` em toda a cadeia crítica |
| T12 | folga livre ≤ folga total | sempre |
| T13 | alterar Q | CPM recalcula sozinho; `cpmCalculatedAt` muda |
| T14 | alterar P | idem |
| T15 | alterar predecessora | CPM e LOB recalculam |
| T16 | ciclo A→B→A→C→B | detectado e nomeado |
| T17 | LOB: atividade cruza a virada do mês | marcada nas duas semanas |
| T18 | LOB: serviço sem atividade na semana | célula vazia, não 0 |
| T19 | LOB: 2 atividades, mesma frente, mesma semana | conflito sinalizado |
| T20 | determinismo | 2 execuções, entrada idêntica → saída **byte a byte** |
| T21 | fuso | mesmo dado em `TZ=UTC` e `TZ=America/Fortaleza` → mesma data |
| T22 | restrição `mustStartOn` | **hoje falha** (§9.2) |
| T23 | calendário do banco | **hoje falha** (§9.3) |
| T24 | frontend não calcula | zero `86400000`/`86_400_000`, zero `Date.now()`, zero `defaultCalendar` em `client/src` (§15 tem a lista completa) |

---

## 25. O QUE NÃO FIZ (e por quê)

| Não fiz | Por quê |
|---|---|
| Escolhi duração entrada × derivada | **GAP-01.** Duas evidências contraditórias (§6). A decisão é sua e muda a interface |
| Migrei o `engine.py` para TypeScript | Precisa do GAP-01 resolvido; e é reimplementação, não reuso |
| Corrigi os 2 bugs do `calculateCpm` | Você pediu auditoria. §9.2 e §9.3 dizem exatamente onde |
| Auditei o código dos MCPs | Não está no disco (§1.3, GAP-08) |
| Propus a tabela de LOCAL | A planilha tem 224 locais hierárquicos; o formato exato depende de GAP-01 |
| Resolvi os GAPs da planilha | São seus. A planilha declara 4 (§3.3) |
| Consolidei a duplicidade D1 | Exige auditar o MCP primeiro |

---

## 26. PRÓXIMO PASSO

Preciso de **uma** decisão sua para desbloquear a Fase 1:

> **A duração da atividade é o que o usuário informa, ou é o que o sistema calcula a partir de
> quantidade e produtividade?**

A evidência está na §6. O que muda com cada resposta:

- **Se "o usuário informa"** → mantém a tela atual, `durationDays` vira campo de primeira
  classe com validação, e a produtividade vira *crítica* (se `Q/P` contradiz a duração
  informada, é conflito a sinalizar). É o que `engine.py` faz hoje.
- **Se "o sistema calcula"** → a duração sai da tela, `quantity` e `productivity` entram como
  obrigatórias, e a planilha A2 (`FIM − INÍCIO + 1`) vira apenas conferência. É o que a
  `CONTINUAR_ARES.md` congelou e o que a planilha A2 documenta.

Duas respostas que eu não vou dar por você, porque dependem de como **você** trabalha em obra:
a terceira pergunta implícita é **dias úteis ou dias civis** para a duração (§13) — as duas
referências discordam, e só o seu processo decide.

Enquanto isso, a Fase 4 (2 bugs de CPM) não depende de nada disso e é a maior melhoria por
hora de trabalho. Digo se quiser que eu ataque.

**Pendência operacional, à parte:** há **3 commits locais à frente do remoto** e o `git push`
trava pedindo credencial do GitHub. Produção segue em `e580dac`, **sem** a correção do parser
SEINFRA — importar a planilha hoje ainda não gera EAP.
