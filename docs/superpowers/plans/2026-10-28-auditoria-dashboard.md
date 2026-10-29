# Dashboard Integrity Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Each task has its own validation and review boundary.

**Goal:** Make the executive dashboard report only operational work and avoid showing a provisional progress metric under a different measurement basis.

**Architecture:** Reuse the QA codes already produced by `planning.grade` and already consumed by the Linha de Balanço. Filter those activities at the dashboard boundary, derive status and schedule summaries from the filtered grade, and pass the same scope to Curva S. Keep source records unchanged. Render progress only when the budget-weighted denominator is available.

**Tech Stack:** React, TypeScript, tRPC, shared cronograma calculations, Vitest, Vite.

**Spec:** `docs/AUDITORIA-EXECUTIVA-2026-10-28.md` and the user-provided master audit prompt.

## Global Constraints

- Preserve AURORA TESTE data, history, measurements and baselines.
- Keep live AURORA verification read-only.
- Do not invent quantities, dates, productivity, locations or percentages.
- Keep the classic application and the current `develop` / `main` workflow.
- Distinguish loading, failure and missing budget data from numeric zero.

## Review Focus

- QA-marked activities must not change executive counts, status totals, dates, budget-weighted progress or the executive curve.
- The dashboard must not switch from quantity weighting to budget weighting while the budget query is pending.
- A failed budget query or a zero applicable denominator must not show a numeric progress result.
- QA records and all non-dashboard modules must remain unchanged.
- The operational grade counts only confirmed, non-example production dated through its local reference day; raw production history remains in the production module.

---

### Task 1: Dashboard operational scope

**Files:**
- Create: `client/src/lib/dashboard-work-scope.ts`
- Test: `client/src/lib/dashboard-work-scope.test.ts`
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/components/PainelDoCronograma.tsx`
- Modify: `client/src/components/ControlTowerDashboard.tsx`
- Modify: `client/src/components/CurvaSControlTower.tsx`
- Modify: `server/construction/lookahead-dados.ts`
- Test: `server/construction/lookahead-dados.test.ts`
- Create: `server/construction/grade-dados.ts`
- Test: `server/construction/grade-dados.test.ts`
- Modify: `server/routers.ts`
- Test: `client/src/components/control-tower-readonly.test.ts`

- [x] Pass QA codes from the grade to the dashboard.
- [x] Exclude QA activities from executive counts, date/status aggregation, and the executive curve.
- [x] Exclude QA activities, production, constraints and commitments from the lookahead/PPC operational query.
- [x] Preserve production records linked to QA as stored data, while excluding those codes from dashboard recent entries.
- [x] Hide budget-weighted progress while its measurement basis is pending, failed, or unavailable.
- [x] Add focused tests and run typecheck/build.
- [x] Run the full test suite after production-grade filtering (146 files, 1,287 passed, 8 skipped).
- [ ] Verify the rendered local dashboard visually.
- [x] Review the diff and update audit/continuity records with current evidence.
- [ ] Verify the rendered fix visually after a local authenticated preview or deployment.

### Follow-up audit subprojects

1. EAP, budget and quantities: version scope, integrity, costing and evidence. Proposal application and cross-version budget/conciliation scope are corrected; visual comparison and deeper cost/quantity audit remain.
2. Schedule, dependencies, CPM, Gantt, baseline and LOB: shared dates, network integrity and visual behavior.
3. Production, measurements, constraints and procurement: traceability, project isolation and data semantics.
4. Application-wide security, resilience, performance, accessibility and responsive UX.

Each subproject requires its own evidence-backed findings and a separate plan before implementation.
