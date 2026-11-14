# Evidência de quantitativo no orçamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Guardar origem e classificação de quantitativos no orçamento sem misturar essa evidência com a fonte do preço ou com produção.

**Architecture:** Estender `budget_items` com texto de evidência e status controlado. O servidor valida os valores e impede a aprovação de item sem evidência classificada; a tela de orçamento edita e exibe os campos separados. As medições existentes continuam vinculadas aos lançamentos aprovados.

**Tech Stack:** TypeScript, tRPC, Drizzle ORM, PostgreSQL, React.

**Spec:** `docs/superpowers/specs/2026-11-14-evidencia-quantitativo-orcamento.md`

## Global Constraints

- O campo `source` atual permanece fonte de preço.
- A situação padrão para itens existentes é `pendente`.
- Não alterar dados vivos da obra nem a baseline.
- `cenario` não significa produção executada.

## Review Focus

- Migração mantém histórico e define status padrão pendente.
- API recusa estado fora do enum e protege versões aprovadas/arquivadas.
- Aprovação enumera código de item e motivo dos bloqueios.
- Interface não chama evidência de quantidade de fonte de preço.
- Nenhum cálculo de produção/medição lê status de cenário como realizado.

---

### Task 1: Persistência e contrato do servidor

**Files:** `drizzle/schema.ts`, nova migration `drizzle/0024_budget_quantity_evidence.sql`, `server/routers.ts`, módulo de aprovação do orçamento e tipos compartilhados relacionados.

- [x] Adicionar `quantityEvidence` e `quantityEvidenceStatus` com default `pendente`.
- [x] Incluir os campos no `budget.updateItem` e persistir somente em versão editável.
- [x] Atualizar gate de aprovação para rejeitar pendente/sem evidência, com mensagens por código do item.
- [x] Cobrir enum inválido, evidência ausente e cenário com evidência em testes focados.

### Task 2: Interface do orçamento

**Files:** `client/src/components/AbaOrcamento.tsx`, estilos locais e testes da tela.

- [x] Adicionar controles “Evidência do quantitativo” e “Situação do quantitativo”.
- [x] Mostrar no detalhe do item a origem/status da quantidade separados da fonte do preço.
- [x] Exibir pendência sem dar a entender que valor está medido ou executado.
- [x] Cobrir edição e renderização dos estados em teste focado.

### Task 3: Verificação e documentação

**Files:** `docs/IMPROVEMENTS.md` e os arquivos desta especificação/plano.

- [x] Rodar os testes focados, checagem de tipos e build local.
- [x] Rever `git diff` para garantir que não houve alteração nos dados do projeto.
- [x] Registrar resultado e limites sem afirmar deploy ou alteração ao vivo.


**Verificação local:** server/planning-integrity.test.ts (10), shared/budget-readiness.test.ts (5), client/src/components/orcamento-edicao.test.ts (1) e drizzle/schema-contrato.test.ts (3) passaram; pnpm check, pnpm build e git diff --check passaram. O build em Node 24 exibiu warnings de variáveis de analytics ausentes e chunk acima de 500 kB. Não houve migração do banco remoto nem deploy.
