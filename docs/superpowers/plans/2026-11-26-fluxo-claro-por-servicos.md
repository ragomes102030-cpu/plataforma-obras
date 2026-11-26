# Fluxo de planejamento claro por serviços — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o primeiro uso do planejamento por serviços ser autoexplicativo e projetar o término da obra a partir dos relatos de campo sem exigir orçamento nem alterar o plano aprovado.

**Architecture:** Adicionar um cálculo puro de previsão restante sobre o CPM existente, alimentado por atualizações vigentes e calendário civil, mais uma trilha visual de cinco etapas no dashboard. Eventos de campo ficam append-only; a previsão é somente leitura, distinta do CPM aprovado e da baseline.

**Tech Stack:** TypeScript, React, tRPC, Drizzle ORM, Vitest, motor CPM existente e calendário de obra.

**Spec:** `docs/superpowers/specs/2026-11-26-fluxo-claro-por-servicos-design.md`

## Restrições globais

- Não exigir preço, orçamento ou Curva S financeira para planejar prazo.
- Não inferir avanço físico a partir de duração, estado ou tempo transcorrido.
- Não gravar relatos como produção, medição ou custo.
- Não alterar CPM planejado, plano aprovado ou baseline ao projetar a execução.
- Usar somente atualizações não corrigidas da obra e versão atuais, até a data de corte.
- Exibir cobertura incompleta, trabalho fora de sequência e bloqueios sem estimativa.
- Não alterar a obra 26 nem o orçamento v4; não publicar nem fazer deploy.

## Review Focus

- Atividade concluída mantém o término real mesmo quando predecessora planejada termina depois; sinalizar execução fora de sequência.
- Atualização em andamento com saldo em dias úteis desloca somente a previsão, preservando duração e CPM planejados.
- Relato corrigido não pode entrar no cálculo junto com o evento substituído.
- Atividade bloqueada sem previsão deixa o término geral indisponível, mas não impede gravar o bloqueio.
- Data inicial ausente ou CPM desatualizado não deve gerar data civil presumida.

---

### Task 1: Cálculo puro da previsão dos serviços

**Files:**
- Create: `shared/activity-schedule-forecast.ts`
- Test: `shared/activity-schedule-forecast.test.ts`
- Modify: `shared/activity-schedule-update.ts`
- Test: `shared/activity-schedule-update.test.ts`

**Interfaces:**
- Consumes: `calculateCpm` de `shared/cpm.ts` e `ActivityScheduleUpdate` normalizado.
- Produces: `calcularPrevisaoDePrazo(input) -> { projectFinishOffset, activities, warnings, unavailableReason }`.

- [x] **Step 1: Write failing behavior tests** para atividade em andamento que desloca sucessoras usando saldo restante; atividade concluída ancorada no término real; atividade sem relato mantida no plano com aviso de cobertura; bloqueio sem estimativa que torna a previsão indisponível; atividade iniciada fora de sequência; tarefa ainda não iniciada que não volta para antes da data de corte.
- [x] **Step 2: Run tests and verify the expected failures** with `pnpm test -- shared/activity-schedule-forecast.test.ts`.
- [x] **Step 3: Implement the pure forecast calculation** in `shared/activity-schedule-forecast.ts`, using working-day offsets, CPM existente, marco de duração zero para atividade concluída, e dependências de entrada removidas somente para atividade já iniciada/concluída. Preserve outgoing links and return explicit out-of-sequence warnings.
- [x] **Step 4: Add failing validator test** proving a report cannot contain both `remainingDurationDays` and `forecastFinishDate` for the same ongoing update.
- [x] **Step 5: Reject ambiguous report inputs** in `shared/activity-schedule-update.ts` and run `pnpm test -- shared/activity-schedule-forecast.test.ts shared/activity-schedule-update.test.ts`.

### Task 2: Consultar e expor a previsão pela API

**Files:**
- Modify: `server/routers.ts`
- Create: `server/activity-schedule-forecast.test.ts`

**Interfaces:**
- Consumes: `calcularPrevisaoDePrazo` from Task 1, current plan, dependency rows, calendar functions and latest non-superseded activity updates.
- Produces: `planning.activityScheduleForecast({projectId, asOf?})`, returning civil finish, current planned finish, coverage counts, out-of-sequence IDs and unavailable reason.

- [x] **Step 1: Write a failing route test** proving the forecast uses only current-version updates up to `asOf`, filters corrected events, respects project access, and leaves planned activities/baseline/production unchanged.
- [x] **Step 2: Run the route test and verify it fails** with `pnpm test -- server/activity-schedule-forecast.test.ts`.
- [x] **Step 3: Implement the read-only query**. Resolve the current plan once; load only its activities/dependencies; load current-version events up to `asOf`; map ISO dates through the project calendar; reject a missing start date or stale CPM with a specific unavailable reason; return coverage and warnings.
- [x] **Step 4: Run the route test** and verify no rows in planned schedule, baseline, or production changed.

### Task 3: Trilha de primeira utilização e painel de prazo

**Files:**
- Create: `client/src/components/RoteiroPlanejamentoServicos.tsx`
- Create: `client/src/components/roteiro-planejamento-servicos.test.ts`
- Modify: `client/src/components/PainelDoCronograma.tsx`
- Modify: `client/src/components/ControlTowerDashboard.tsx`
- Modify: `client/src/components/PainelPlanejamento.tsx`
- Modify: `client/src/control-tower.css`
- Modify: `client/src/planilha.css`

**Interfaces:**
- Consumes: planning readiness/list, active baseline, activity update summary and `planning.activityScheduleForecast`.
- Produces: five-step guide with one next action; forecast card clearly distinct from approved plan/baseline; optional physical-weight/QA panel collapsed by default.

- [x] **Step 1: Write failing render tests** for a new project (first step points to EAP), plan awaiting CPM (start/CPM step), approved plan ready for field updates, and forecast unavailable due to a blocked service without estimate.
- [x] **Step 2: Run the UI tests and confirm failure** with `pnpm test -- client/src/components/roteiro-planejamento-servicos.test.ts`.
- [x] **Step 3: Implement the service-first guide and forecast display** with clear labels: “Plano aprovado”, “Previsão pelos relatos”, “serviços atualizados”, and “orçamento opcional”. Keep actual physical progress and finance in their own sections.
- [x] **Step 4: Move physical-weight and QA controls** in `PainelPlanejamento` under a collapsed optional section without removing their actions.
- [x] **Step 5: Run focused UI tests** and verify keyboard labels and dashboard rendering.

### Task 4: Documentation and verification

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/IMPROVEMENTS.md`

- [x] **Step 1: Document** the single service-first path, forecast assumptions, and separation from plan/baseline/physical/financial indicators.
- [x] **Step 2: Run focused tests** for forecast, temporal updates, CPM, baseline, journey rendering and Dashboard.
- [x] **Step 3: Run `pnpm check`, `pnpm build`, `pnpm db:verify:scratch`, and `git diff --check`**; record exact output and any warnings.
- [x] **Step 4: State live validation as NOT TESTÁVEL** unless an isolated deployment and browser scenario is specifically run; do not use obra 26 as a fixture.

## Execution note

The user explicitly requested execution in the current local branch. Do not pause for another design approval; use `superpowers:executing-plans` and TDD to execute these tasks. Do not commit, publish, deploy, or mutate live work data.
