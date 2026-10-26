# Clareza do gate da Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o bloqueio da EAP na faixa de fluxo quando a aba Baseline estiver aberta.

**Architecture:** `Home.tsx` já recebe a aba atual e o estado do coordenador. Ele derivará a cópia contextual apenas para Baseline com versão não aprovada; o servidor e os gates permanecem inalterados.

**Tech Stack:** React, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-gate-clarity-design.md`

## Global Constraints

- Não alterar persistência, gates do servidor ou dados da obra.
- Manter a mensagem padrão para todas as abas fora de Baseline.

## Review Focus

- Baseline sem versão de plano deve manter a mensagem padrão; o teste estático não cobre dados ausentes.
- Baseline com versão aprovada deve manter a mensagem padrão; o teste estático não cobre a renderização condicional.
- Outras abas devem manter a mensagem do coordenador; o teste estático limita-se à presença da cópia.

---

### Task 1: Mensagem contextual da Baseline

**Files:**
- Modify: `client/src/pages/Home.tsx:684-695`
- Test: `client/src/pagina-inicial.test.ts`

**Interfaces:**
- Consumes: `aba`, `coordenador.data.planVersion.status` e `coordenador.data.gateMessage`.
- Produces: cópia de status específica para Baseline em rascunho.

- [ ] **Step 1: Write the failing test**

Adicionar expectativa para a cópia `Baseline bloqueada: aprove a EAP da versão de trabalho antes de capturar.` em `pagina-inicial.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run client/src/pagina-inicial.test.ts`
Expected: FAIL porque a cópia ainda não existe.

- [ ] **Step 3: Implement contextual status in `Home.tsx`**

Derivar título e detalhe do status antes do JSX. Quando `aba === "baseline"` e `planVersion.status !== "approved"`, usar `Baseline bloqueada` e a cópia definida no teste; nos demais casos, preservar o conteúdo atual.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run client/src/pagina-inicial.test.ts`
Expected: PASS.

- [ ] **Step 5: Run type and suite verification**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Home.tsx client/src/pagina-inicial.test.ts docs/superpowers
git commit -m "fix: esclarecer bloqueio da baseline"
```
