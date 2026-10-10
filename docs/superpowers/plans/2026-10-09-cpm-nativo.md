# Motor de CPM Nativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o CPM ser calculado localmente (sem MCP), persistido no banco, e usado pela API — com validação na AURORA TESTE.

**Architecture:** O motor CPM já existe em `shared/cpm.ts` (puro, sem dependências). O calculador em `server/construction/cpm-calculator.ts` já valida e calcula. O que falta é: (1) um serviço que persista o resultado no banco, (2) um router que use o motor local em vez do MCP, (3) testes E2E na AURORA TESTE.

**Spec:** `docs/superpowers/specs/cpm-nativo.md` (a ser criado)

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, Supabase

**Global Constraints:**
- TDD rigoroso: RED → GREEN → REFACTOR
- Todas as implementações devem ser testadas na AURORA TESTE (projectId=7)
- Não quebrar funcionalidades existentes
- Commits frequentes (1 por task)

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/cpm.ts` | Motor CPM puro (já existe) |
| `server/construction/cpm-calculator.ts` | Calculador com validação (já existe) |
| `server/construction/cpm-persister.ts` | **NOVO** — Persiste resultado do CPM no banco |
| `server/routers.ts` | Router tRPC (modificar para usar motor local) |
| `server/construction/cpm-persister.test.ts` | **NOVO** — Testes do persister |
| `tests/aurora-cpm.e2e.spec.ts` | **NOVO** — Teste E2E na AURORA TESTE |

---

## Task 1: Serviço de persistência de CPM

**Files:**
- Create: `server/construction/cpm-persister.ts`
- Test: `server/construction/cpm-persister.test.ts`

**Interfaces:**
- Consumes: `calculateDeterministicCpm` de `./cpm-calculator`
- Produces: `persistCpmResult(projectId: number, versionId: number, result: ScheduleResult): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// server/construction/cpm-persister.test.ts
import { describe, it, expect } from "vitest";
import { persistCpmResult } from "./cpm-persister";

describe("persistCpmResult", () => {
  it("should persist CPM result to database", async () => {
    // TODO: implement test
    expect(true).toBe(false); // RED
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/construction/cpm-persister.test.ts`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/construction/cpm-persister.ts
import type { ScheduleResult } from "../../shared/cpm";

export async function persistCpmResult(
  projectId: number,
  versionId: number,
  result: ScheduleResult
): Promise<void> {
  // TODO: implement
  throw new Error("Not implemented");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/construction/cpm-persister.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/construction/cpm-persister.ts server/construction/cpm-persister.test.ts
git commit -m "feat(cpm): add CPM persister service"
```

---

## Task 2: Router tRPC para CPM nativo

**Files:**
- Modify: `server/routers.ts` (adicionar procedure `calculateCpmLocal`)
- Test: `server/routers.test.ts` (adicionar teste)

**Interfaces:**
- Consumes: `persistCpmResult` de `./construction/cpm-persister`
- Produces: `calculateCpmLocal` procedure (tRPC)

- [ ] **Step 1: Write the failing test**

```typescript
// server/routers.test.ts
describe("calculateCpmLocal", () => {
  it("should calculate CPM locally without MCP", async () => {
    // TODO: implement test
    expect(true).toBe(false); // RED
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routers.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/routers.ts
calculateCpmLocal: protectedProcedure
  .input(z.object({ projectId: z.number().int().positive() }))
  .mutation(async ({ ctx, input }) => {
    // TODO: implement
    throw new Error("Not implemented");
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/routers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routers.ts server/routers.test.ts
git commit -m "feat(cpm): add calculateCpmLocal router"
```

---

## Task 3: Teste E2E na AURORA TESTE

**Files:**
- Create: `tests/aurora-cpm.e2e.spec.ts`

**Interfaces:**
- Consumes: API HTTP
- Produces: Teste E2E que valida CPM na AURORA TESTE

- [ ] **Step 1: Write the failing test**

```typescript
// tests/aurora-cpm.e2e.spec.ts
import { test, expect } from "@playwright/test";

test("AURORA TESTE has valid CPM", async ({ request }) => {
  const response = await request.post("/api/trpc/calculateCpmLocal", {
    data: { projectId: 7 },
  });
  expect(response.ok()).toBe(true); // RED
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/aurora-cpm.e2e.spec.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

(Already implemented in Task 2)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/aurora-cpm.e2e.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/aurora-cpm.e2e.spec.ts
git commit -m "test(cpm): add E2E test for AURORA TESTE"
```

---

## Review Focus

1. **Rede fragmentada** — CPM deve detectar e reportar redes desconectadas
2. **Ciclos** — CPM deve detectar ciclos e retornar erro claro
3. **Atividades sem duração** — CPM deve rejeitar atividades com duração zero
4. **Persistência falha** — CPM deve retornar erro se persistência falhar
5. **MCP indisponível** — CPM local deve funcionar mesmo se MCP cair

---

## Self-Review

- [ ] Spec coverage: todos os requisitos do CPM nativo estão cobertos?
- [ ] Placeholder scan: nenhum "TBD" ou "implement later"?
- [ ] Type consistency: tipos consistentes entre tasks?
- [ ] Review Focus: cada item tem um teste?
