# PLANNING_ENGINE.md — Motor de Planejamento

## O QUE É O MOTOR DE PLANEJAMENTO

O motor de planejamento transforma entradas (quantitativos, produtividades, recursos) em saídas (cronograma, CPM, Gantt, LOB, controle, curva S).

---

## 1. CPM (Critical Path Method) — Cálculo do Cronograma

### E1.1. Entradas

| Entidade | Campos | Finalidade |
|----------|--------|------------|
| `schedule_activities` | startOffset, durationDays, plannedQuantity, productivity, status, progress | Atividades base |
| `schedule_dependencies` | predecessorId, successorId, type(FS/SS/FF/SF), lag | Relacionamentos |

### E1.2. Lógica

```
PARA CADA atividade:
  INICIALIZAR:
    earlyStart = startOffset
    earlyFinish = startOffset + durationDays
    lateStart = earlyStart
    lateFinish = earlyFinish
    totalFloat = 0

PARA CADA dependência (predecessor → successor):
  SE type == "FS":
    successor.earlyStart = MAX(predecessor.earlyFinish + lag, successor.earlyStart)
  SE type == "SS":
    successor.earlyStart = MAX(predecessor.earlyStart + lag, successor.earlyStart)
  SE type == "FF":
    successor.earlyFinish = MAX(predecessor.earlyFinish + lag, successor.earlyFinish)
  SE type == "SF":
    successor.earlyFinish = MAX(predecessor.earlyStart + lag, successor.earlyFinish)

DEPOIS DAS dependências:
  PROJETO.duration = MAX(todas.earlyFinish)

VOLTAR (backward pass):
  PROJETO.projectFinish = MAX(activities.earlyFinish)
  
  PARA CADA atividade:
    lateFinish = PROJETO.projectFinish - (atividade.earlyFinish - atividade.earlyStart)
    lateStart = lateFinish - atividade.durationDays

CALCULAR FOLGA:
  totalFloat = lateStart - earlyStart = lateFinish - earlyFinish
  
CRITICO: totalFloat == 0
```

### E1.3. Saídas

| Campo | Obtido de | Descrição |
|-------|-----------|-----------|
| earlyStart | startOffset + FS/SS chains | Quando a atividade pode começar o mais cedo possível |
| earlyFinish | earlyStart + durationDays | Quando a atividade termina no mais cedo |
| lateStart | backward pass | Quando a atividade deve começar no mais tarde para não atrasar o projeto |
| lateFinish | lateStart + durationDays | Quando a atividade termina no mais tarde |
| totalFloat | lateStart - earlyStart | Folga total |
| critical | totalFloat == 0 | 1 = crítica, 0 = não crítica |
| projectDuration | MAX(earlyFinish) | Duração total do projeto |

### E1.4. Grau de Confiança

| Teste | Resultado | Evidência |
|-------|-----------|-----------|
| Rede linear (3 atividades) | CORRETO | `shared/cpm.test.ts`, `cpm-calculator.test.ts` |
| Rede com paralelas | CORRETO | `shared/cpm.test.ts` |
| Dependência SS + lag | CORRETO | `shared/cpm.test.ts` |
| Detecção de ciclo | CORRETO | `dependency-validator.test.ts` |

**Grau:** CONFIRMADO (testes automatizados passando)

---

## 2. CONTROLE — Planejado vs Realizado

### E2.1. Entradas

| Entidade | Campos | Finalidade |
|----------|--------|------------|
| `schedule_activities` | plannedQuantity, earlyStart, durationDays | Planejamento |
| `production_entries` (status="confirmada") | quantity, productionDate, activityId | Produção real |

### E2.2. Lógica

```
PARA CADA atividade:
  plannedProgress = MIN(100, (dias_decorridos - earlyStart) / durationDays × 100)
  actualProgress = MIN(100, total_produzido / plannedQuantity × 100)
  variance = actualProgress - plannedProgress

  se plannedProgress > 100: plannedProgress = 100
  se actualProgress > 100: actualProgress = 100

VARIAÇÃO TOTAL:
  variance_total = sum(actualProgress × plannedQuantity) / sum(plannedQuantity) - sum(plannedProgress × plannedQuantity) / sum(plannedQuantity)
```

### E2.3. Saídas

| Campo | Descrição |
|-------|-----------|
| plannedProgress | % do planejamento executado até a data |
| actualProgress | % da quantidade produzida |
| variance | Diferença (pp = percentage points) |
| plannedQuantity | Quantidade total planejada |
| actualQuantity | Quantidade total produzida |

**Exemplo:**
- Atividade: Alvenaria, 1000 m², 20 m²/dia, 50 dias
- Data de referência: dia 20
- Planejado: (20 - 0) / 50 × 100 = 40%
- Se produzido: 200 m² → Realizado: 200/1000 × 100 = 20%
- Variância: 20 - 40 = -20pp (atraso)

### E2.4. Grau de Confiança

| Teste | Resultado | Evidência |
|-------|-----------|-----------|
| `planning.control` returns variance | VERIFICADO | Código lido |
| `production_entries` filter by status="confirmada" | VERIFICADO | Código lido |
| Formula: actual/planned × 100 | VERIFICADO | `planning.control` cálculo |

**Grau:** CONFIRMADO (código analisado, não testado em execução)

---

## 3. LINHA DE BALANÇO (LOB — Line of Balance)

### E3.1. O que é

A Linha de Balanço mostra a **progressão da produção no tempo** — quantos dias cada atividade leva, onde estão as sobreposições, onde estão as interrupções.

### E3.2. Entradas

| Entidade | Campos | Finalidade |
|----------|--------|------------|
| `schedule_activities` | plannedQuantity, productivity, durationDays, earlyStart | Atividades planejadas |
| `production_entries` (status="confirmada") | quantity, productionDate, activityId | Produção real |

### E3.3. Lógica

```
PARA CADA atividade:
  ritmo = plannedQuantity / durationDays (unidade/dia)
  
  INICIO: earlyStart (dias)
  FIM: earlyStart + durationDays (dias)
  
  SE tiver produção real:
    atraso = (dias_decorridos - earlyStart) - (total_produzido / ritmo)
    dias_atrasados = MAX(0, atraso)
    novo_fim = FIM + dias_atrasados
```

### E3.4. Saídas

| Campo | Descrição |
|-------|-----------|
| start | Dia de início da atividade |
| duration | Duração em dias |
| end | Dia de término esperado |
| rhythm | Ritmo de produção (unidade/dia) |
| plannedQuantity | Quantidade planejada |
| actualQuantity | Quantidade produzida |
| progress | % de progresso |
| delay | Dias de atraso (se houver) |
| adjustedEnd | Término ajustado pelo atraso |

### E3.5. Grau de Confiança

| Teste | Resultado | Evidência |
|-------|-----------|-----------|
| `planning.lob` procedure exists | VERIFICADO | `server/routers.ts` linha 3422 |
| Formula do ritmo | INFERIDO | `plannedQuantity / durationDays` (não testado) |

**Grau:** IMPLEMENTADO (procedimento existe, fórmula não confirmada por teste)

---

## 4. CURVA S (S-Curve)

### E4.1. O que é

A Curva S mostra o **progresso cumulativo** ao longo do tempo — o acumulado da produção.

### E4.2. Entradas

| Entidade | Campos | Finalidade |
|----------|--------|------------|
| `schedule_activities` | plannedQuantity, earlyStart, durationDays | Planejamento |
| `production_entries` (status="confirmada") | quantity, productionDate, activityId | Produção real |

### E4.3. Lógica

```
PARA CADA dia no período (0 até projectDuration):
  plannedCumulative = 0
  PARA CADA atividade:
    overlap_days = MIN(durationDays, dia - earlyStart)
    IF overlap_days > 0:
      plannedProgress_this_day = overlap_days / durationDays × plannedQuantity
      plannedCumulative += plannedProgress_this_day
  
  actualCumulative = SUM(producao confirmada até esse dia)

  plannedPct = plannedCumulative / totalPlannedQuantity × 100
  actualPct = actualCumulative / totalPlannedQuantity × 100
```

### E4.4. Saídas

| Campo | Descrição |
|-------|-----------|
| date | Data do ponto |
| plannedPct | % do planejado cumulativo |
| actualPct | % do realizado cumulativo |

**Exemplo:**
- Dia 0: plannedPct=0%, actualPct=0%
- Dia 10: plannedPct=20%, actualPct=15% (entregaram 150 m² de 1000 m²)
- Dia 20: plannedPct=40%, actualPct=35% (mais 200 m² = total 350 m²)
- Dia 30: plannedPct=60%, actualPct=60% (atingiram o planejado)

### E4.5. Grau de Confiança

| Teste | Resultado | Evidência |
|-------|-----------|-----------|
| `planning.scurve` procedure exists | VERIFICADO | `server/routers.ts` linha 3422 |
| Fórmula do acumulado | VERIFICADO | `planning.scurve` campo `cumulativePlanned` |
| Filtro de produção confirmada | VERIFICADO | `status="confirmada"` no código |
| Reactivity (produção novo altera a curva) | NÃO TESTADO | Requer teste funcional |

**Grau:** CONFIRMADO (código analisado, fórmula verificável, não testado em execução)

---

## 5. BASELINE

### E5.1. O que é

A baseline é a **cópia do planejamento no momento da captura**. Serve como referência para comparar o planejamento original com o atualização.

### E5.2. Entradas

| Entidade | Campos | Finalidade |
|----------|--------|------------|
| `schedule_activities` | Todos os campos do cronograma | Estado atual do planejamento |

### E5.3. Lógica

```
CAPTURA:
  PARA CADA atividade:
    CRIAR scheduleBaselineItem:
      baselineId = nova baseline.id
      activityId = atividade.id
      startOffset = atividade.startOffset
      durationDays = atividade.durationDays
      earlyStart = atividade.earlyStart
      earlyFinish = atividade.earlyFinish

COMPARAÇÃO:
  PARA CADA atividade:
    baseline_item = SELECT scheduleBaselineItems WHERE activityId = atividade.id
    diff_startOffset = atividade.startOffset - baseline_item.startOffset
    diff_duration = atividade.durationDays - baseline_item.durationDays
    diff_ES = atividade.earlyStart - baseline_item.earlyStart
    diff_EF = atividade.earlyFinish - baseline_item.earlyFinish
```

### E5.4. Saídas

| Campo | Descrição |
|-------|-----------|
| baseline.id | Identificador da baseline |
| baseline.name | Nome dado pelo usuário |
| scheduleBaselineItems | Itens copiados do cronograma |
| diff_* | Diferenças entre planejamento atual e baseline |

### E5.5. Grau de Confiança

| Teste | Resultado | Evidência |
|-------|-----------|-----------|
| `planning.captureBaseline` procedure exists | VERIFICADO | `server/routers.ts` linha 3300 |
| Copia startOffset, durationDays, ES, EF | VERIFICADO | código lido |
| Comparação após alteração | NÃO TESTADO | Requer teste funcional |

**Grau:** CONFIRMADO (código analisado, functionalidade implementada)

---

## 6. ATUALIZAÇÃO DE LANÇAMENTO DE PRODUÇÃO

### E6.1. O que acontece quando alteramos produção

```
1. ALTERAR produção_entries.quantity
2. Recalcular:
   - production_entries.progresso (atualProgress)
   - planning.control (variância)
   - planning.scurve (curva S)
   - planning.lob (linha de balanço)
3. Atualizar schedule_activities.progress (se necessário)
```

### E6.2. Grau de Confiança

| Teste | Resultado | Evidência |
|-------|-----------|-----------|
| `production.confirmEntry` atualiza status | VERIFICADO | código lido |
| Recalculo de scurve | NÃO TESTADO | Requer teste funcional |

**Grau:** IMPLEMENTADO (mecanismo existe, reação em cadeia não testada)

---

## 7. FLUXO COMPLETO

```
1. USUÁRIO INFORMA:
   - Nome da obra
   - Quantidade de cada serviço
   - Produtividade de cada serviço

2. SISTEMA CRIA:
   - Obra (projects)
   - EAP (wbs_nodes)
   - Orçamento seed (budget_versions, budget_items)

3. USUÁRIO MAPPA:
   - Atividades (schedule_activities)
   - Dependências (schedule_dependencies)
   - Quantidade e produtividade de cada atividade

4. SISTEMA CALCULA:
   - CPM (earlyStart, earlyFinish, lateStart, lateFinish, float, critical)
   - Cronograma base (datas de início e fim)

5. USUÁRIO LANÇA PRODUÇÃO:
   - production_entries com status="confirmada"

6. SISTEMA RECALCULA:
   - Controle (planejado vs realizado)
   - Curva S (progresso cumulativo)
   - Linha de Balanço (ritmo e atrasos)
   - Progresso das atividades (schedule_activities.progress)

7. USUÁRIO CAPTURA BASELINE:
   - Cópia do cronograma atual

8. USUÁRIO ALTERA:
   - Quantidade
   - Produtividade
   - Equipes

9. SISTEMA RECALCULA:
   - CPM
   - Controle
   - Curva S
   - Linha de Balanço
   - Progresso
   - Compara baseline vs atual
```

---

## RESUMO DE GRAUS DE CONFIANÇA

| Módulo | Grau | Evidência |
|--------|------|-----------|
| CPM | CONFIRMADO | Testes automatizados passando |
| Controle | CONFIRMADO | Código analisado, lógica matemática verificável |
| Linha de Balanço | IMPLEMENTADO | Procedimento existe, fórmula não confirmada |
| Curva S | CONFIRMADO | Código analisado, fórmula verificável |
| Baseline | CONFIRMADO | Código analisado, funcionalidade implementada |
| Atualização em cadeia | IMPLEMENTADO | Mecanismo existe, reação não testada |

---

Versão: 1.0
Data: 2026-09
