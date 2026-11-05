# SDD ledger — plan: docs/superpowers/plans/2026-11-05-cronograma-operacional-integrado.md

Workspace: C:\Users\Correta Engenharia\.codex\worktrees\cronograma-operacional-mvp\plataforma-obras
Branch: feat/cronograma-operacional-mvp
Spec: docs/superpowers/specs/2026-11-05-cronograma-operacional-integrado-design.md

Pre-flight Task 1 → Tasks 5/6: `activityId` is produced as the stable operational identity and consumed by Gantt/Cronograma; interfaces agree.
Pre-flight Task 2 → Tasks 3/4/6: `OrientacaoDeBloqueio` is produced once and reused by Rede, Dashboard and Cronograma; interfaces agree.
Pre-flight Task 4 → Task 6: readiness separates physical and financial states; Cronograma consumes them without using budget as a physical weight.
Pre-flight Task 5 → Task 6: Gantt selection is activity-based and Cronograma shares that selection; interfaces agree.

Ruling: the worktree starts from commit abe6a60, which contains the approved spec and plan; implementation branch is separate because the source checkout already owns the design branch. Cost if wrong: documentation and code could diverge, so both files remain in this branch and are reviewed together.

## Task 1 — complete

- `activityId` is required on every schedule row and is the primary Gantt identity.
- Duplicate WBS codes remain separate activity rows, links, critical states, details and baseline bars.
- Current production is allocated by exact activity ID. Historical production falls back by WBS only when the current match is unique; ambiguous quantities are exposed in `producaoSemAlocacao`.
- LOB date lookup prefers activity ID and retains the WBS fallback for legacy fixtures.
- Verification: TypeScript check passed; 42 focused tests passed across tree, baseline, production allocation, dependency identity and LOB compatibility.

## Task 2 — complete

- Added a deterministic blocker contract with cause, impact, ordered resolution steps, target tab and resolution evidence.
- Guidance follows EAP → activities → dependencies → CPM → baseline and exposes additional simultaneous blockers without replacing human explanation with technical errors.
- The workbar renders the primary blocker through `OrientacaoDeEtapa`; the action dispatches navigation to the exact corrective tab.
- Ruling: the component test uses `.test.ts`, not the planned `.test.tsx`, because this repository's Vitest include intentionally runs client `*.test.ts` files in the Node/static-render harness. Cost if wrong: a `.tsx` test would exist but would not run in the full suite.
- Verification: 24 focused tests and TypeScript check passed.

## Task 3 — complete

- Dependency creation is a compact full-width region above a separate full-width network table.
- The network table has a sticky header, `clamp(320px, 55vh, 720px)` work area, search, type filter, critical-path filter, visible counts and expandable long rows.
- Removing a relationship now requires an explicit confirmation showing predecessor and successor; Cancel, backdrop and Escape preserve it.
- Invalid-network guidance reuses the didactic contract from Task 2. Approved versions continue to explain how to open a work version without losing the approved plan or baseline.
- Verification: 12 focused dependency tests and TypeScript check passed. Responsive rules cover the 1024 px content width; live 1366/1024 visual confirmation remains in Task 7 after deployment.

## Task 4 — complete

- Physical progress, financial readiness and earned value now have independent states. A missing or didactic budget no longer turns physical progress into zero or hides a valid physical plan.
- The dashboard distinguishes missing physical weights, missing confirmed production, missing approved budget, didactic prices, incomplete cost coverage and query errors.
- Every unavailable indicator explains what happened, why it cannot be published, where to resolve it and what evidence releases it.
- The planned physical target remains visible when weights exist but production has not yet been confirmed; realized, variance and EV remain unavailable instead of being rendered as zero.
- Ruling: the current data model does not persist approved physical weights. The live panel therefore reports that limitation honestly and retains per-activity visibility; Task 6 will make the operational route explicit without inventing an aggregate.
- Verification: 30 focused readiness/dashboard tests and TypeScript check passed. The deprecated phrase “régua validada” is absent from the affected UI and decision code.

## Task 5 — complete

- The Gantt now uses explicit semantic tokens for planned, critical, actual, baseline, warning and milestone states. Critical work retains a visible marker and textual legend instead of depending on color alone.
- Today and construction start use solid, labelled markers; the start marker is omitted when it is the same date as today. The approved baseline uses a hatch pattern, making it distinct from the current bar in color and shape.
- Selecting an activity highlights only its direct predecessor/successor links and attenuates unrelated links. With no selection, all visible links remain discreet and readable.
- SVG export now uses activity identity instead of WBS code for links and baseline matching, labels today/start, preserves duplicate WBS activities and mirrors the screen legend.
- Verification: 17 focused Gantt/baseline/export tests and TypeScript check passed. No unexplained dotted date or dependency line remains.
