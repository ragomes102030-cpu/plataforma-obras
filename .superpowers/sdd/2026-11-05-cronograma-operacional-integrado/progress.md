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
