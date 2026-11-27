# Dashboard de Controle Físico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir planejar e acompanhar prazo e produção sem orçamento aprovado, mantendo o controle financeiro como leitura complementar.

**Architecture:** A Dashboard passa a priorizar término, avanço físico, atividades e compromissos. A Curva S exibida na Dashboard usa pesos físicos aprovados e produção confirmada por `activityId`, sem consultar itens ou valores do orçamento. Dados financeiros continuam no módulo financeiro e não bloqueiam a leitura operacional.

**Tech Stack:** React 19, TypeScript, tRPC, Vitest, Recharts.

**Spec:** `docs/superpowers/specs/2026-11-05-cronograma-operacional-integrado-design.md`

## Global Constraints

- Não usar orçamento como peso físico ou como requisito para CPM, baseline, produção ou Dashboard física.
- Ausência de produção é “Sem dado”, nunca 0% executado.
- Peso físico somente entra na curva após aprovação explícita e soma de 100%.
- Produção é vinculada por `activityId`; WBS só organiza a visualização.
- O módulo financeiro permanece disponível, mas seus bloqueios não ocupam o radar operacional.

## Review Focus

- Uma obra sem qualquer orçamento ainda exibe término, atividades, produção e Curva S física quando os pesos estiverem aprovados.
- Lançamento em atividade com WBS repetido atualiza somente a atividade com o mesmo `activityId`.
- Pesos incompletos, sem aprovação ou sem quantidade não produzem percentual agregado.
- A falta de orçamento não produz erro global de carregamento na Dashboard.

### Task 1: Curva física independente do orçamento

**Files:**
- Create: `shared/curva-fisica.ts`
- Create: `shared/curva-fisica.test.ts`
- Modify: `client/src/components/CurvaSControlTower.tsx`

- [ ] Escrever testes para pesos físicos aprovados, pesos pendentes e quantidade ausente.
- [ ] Implementar o contrato puro de insumos da curva física.
- [ ] Substituir pesos monetários por pesos físicos e mapear produção por `activityId`.
- [ ] Executar testes focados, tipagem e build.

### Task 2: Dashboard com foco operacional

**Files:**
- Modify: `client/src/components/ControlTowerDashboard.tsx`
- Modify: `client/src/components/dashboard-integridade-render.test.ts`
- Modify: `client/src/components/PainelDoCronograma.tsx`

- [ ] Escrever teste de renderização para a leitura física sem orçamento.
- [ ] Mover orientações financeiras para seção complementar e trocar o KPI de EV por avanço físico.
- [ ] Remover orçamento e coerência financeira do carregamento e radar operacional.
- [ ] Executar testes focados, tipagem e build.
