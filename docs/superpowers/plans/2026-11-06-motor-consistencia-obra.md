# Motor de Consistência da Obra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Criar uma fonte única de verdade para prontidão da obra, bloquear indicadores downstream quando a etapa anterior estiver inválida e explicar exatamente como corrigir cada bloqueio.

**Architecture:** Um avaliador puro em `shared/` recebe o snapshot já carregado da obra e devolve estados por etapa, bloqueios, impactos e ações. O servidor expõe esse resultado por uma consulta protegida; dashboard, orçamento, cronograma e baseline passam a consumir o mesmo contrato. A avaliação não altera dados e só mutations específicas continuam gravando alterações.

**Tech Stack:** TypeScript, tRPC, Drizzle/PostgreSQL, React, Vitest.

**Spec:** `docs/PLANNING_ENGINE.md`, `docs/BUSINESS_RULES.md`, `docs/ENGINEERING_COVERAGE_MATRIX.md`.

## Global Constraints

- Não aprovar automaticamente EAP, orçamento, CPM ou baseline.
- Não inventar datas, quantidades, produtividade, composição ou localização.
- Dados didáticos nunca habilitam avanço financeiro.
- Falhas de consulta devem aparecer como estado `indisponivel`, não como zero válido.

## Review Focus

- Obra sem EAP aprovada: downstream bloqueado e orientação para revisar EAP.
- Orçamento com preço sem composição: financeiro bloqueado, não mascarado como aprovado.
- Dependências alteradas após CPM: CPM `desatualizado` e baseline bloqueada.
- Medição sem unidade/quantidade: avanço físico indisponível.
- Falha de uma query: indicador indisponível, sem substituir por valor zero.

---

### Task 1: Contrato puro de prontidão integrada

**Files:**
- Create: `shared/obra-readiness.ts`
- Test: `shared/obra-readiness.test.ts`

- [ ] Escrever testes para estados `bloqueado`, `incompleto`, `pronto_revisao`, `aprovado` e `desatualizado`.
- [ ] Implementar `avaliarProntidaoObra(snapshot): ProntidaoObra` com etapas `escopo`, `eap`, `orcamento`, `atividades`, `rede`, `cpm`, `baseline`, `execucao`.
- [ ] Garantir que cada bloqueio contenha `codigo`, `titulo`, `explicacao`, `comoResolver`, `impacta` e `severidade`.
- [ ] Rodar `pnpm vitest run shared/obra-readiness.test.ts --run`.

### Task 2: Consulta server-side do snapshot integrado

**Files:**
- Modify: `server/routers.ts`
- Test: `server/obra-readiness.test.ts`

- [ ] Criar `planning.readiness` protegido por projeto.
- [ ] Reutilizar queries existentes de EAP, orçamento, atividades, dependências, CPM, baseline e medições.
- [ ] Retornar estado de consulta indisponível sem converter falha em dado válido.
- [ ] Cobrir autorização e projeto sem dados.

### Task 3: Dashboard como painel de decisão

**Files:**
- Modify: `client/src/components/ControlTowerDashboard.tsx`
- Modify: `client/src/lib/dashboard-integridade.ts`
- Test: `client/src/components/obra-readiness-dashboard.test.ts`

- [ ] Consumir `planning.readiness`.
- [ ] Mostrar a primeira barreira causal e a cadeia de impactos.
- [ ] Linkar cada ação diretamente à aba responsável.
- [ ] Diferenciar `bloqueado`, `desatualizado`, `indisponível` e `aprovado`.

### Task 4: Gates nas áreas de orçamento e cronograma

**Files:**
- Modify: `client/src/components/AbaOrcamento.tsx`
- Modify: `client/src/components/CronogramaOperacional.tsx`
- Modify: `client/src/components/AbaBaseline.tsx`

- [ ] Remover mensagens independentes que contradigam o motor central.
- [ ] Exibir explicação e ação recomendada do contrato integrado.
- [ ] Manter orçamento didático e composição pendente como bloqueios distintos.
- [ ] Impedir visualização enganosa de baseline pronta quando CPM estiver desatualizado.

### Task 5: Documentação e regressão de fluxo completo

**Files:**
- Create: `docs/MOTOR-CONSISTENCIA-OBRA.md`
- Modify: `docs/ROADMAP.md`
- Test: `server/obra-readiness.e2e.test.ts`

- [ ] Documentar a máquina de estados, dependências e regras de transição.
- [ ] Criar regressão Aurora/Escola para validar que a cadeia de bloqueios é explicável.
- [ ] Rodar typecheck, testes completos relacionados e smoke live após deploy.

