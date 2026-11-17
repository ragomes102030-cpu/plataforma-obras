# Piazza budget multi-service linking Implementation Plan

**Goal:** Link a Piazza budget package to multiple official SEINFRA/SINAPI services through the budget editor and compute a traceable unit price.

**Architecture:** Reuse relational analytic composition tables, whose component enum already supports service. Add one transactional budget mutation for the multi-service link, and a compact editor panel for service selection, coefficients, preview, and save. Keep source, region, unit, quantity, and evidence validation on the server.

**Tech Stack:** TypeScript, tRPC, Drizzle ORM, React, Vitest, PostgreSQL.

**Spec:** docs/superpowers/specs/2026-11-17-piazza-multiple-official-services-design.md

## Constraints

- No JSON blobs or placeholder data are introduced.
- Never guess the unit or total quantity; the user-visible item fields and evidence remain explicit.
- Only active service rows from one official catalog matching project region may be components.
- Every component keeps an official item ID, coefficient, and price snapshot.

## Tasks

### Task 1: Atomic multi-service composition API
Files: server/routers.ts; server/planning-integrity.test.ts
Add budgets.linkOfficialServiceComposition; validate access, budget state, output unit, active service items, catalog and region. Atomically create composition and components, link the budget item, preserve quantity evidence, and audit the write. Verify valid pricing and rejection of wrong region, duplicate lines, and invalid coefficients.

### Task 2: Budget editor workflow
File: client/src/components/AbaOrcamento.tsx
Add service search, selected lines, per-output-unit coefficients, subtotals, remove controls, summed unit-price preview, and save through the mutation. Keep existing single-service and official-composition flows. Enable clearing either selector when search is empty.

### Task 3: Verify
Run focused planning-integrity tests and pnpm check. Confirm no migration is needed because the service component enum and component snapshot columns already exist. Review the final diff.
