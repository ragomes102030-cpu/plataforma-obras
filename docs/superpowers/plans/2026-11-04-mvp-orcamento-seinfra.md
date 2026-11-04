# MVP de orçamento SEINFRA e controle assistido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transformar o catálogo SEINFRA existente em um fluxo de orçamento auditável, com sugestões técnicas revisáveis, sem alterar versões aprovadas nem inventar preços.

**Architecture:** O catálogo oficial continua versionado em `priceCatalogs`/`priceItems`; o matching gera candidatos por código, descrição e unidade. O engenheiro aceita ou rejeita cada sugestão, e somente a aceitação cria/atualiza composição e registra auditoria. O dashboard e a aprovação do orçamento consomem o estado de revisão, mas não substituem decisão profissional.

**Tech Stack:** TypeScript, React, tRPC, Drizzle/PostgreSQL, Vitest, GitHub Actions e Render.

**Spec:** `shared/price-sources/README.md`, `shared/price-sources/types.ts`, `server/construction/coerencia-engenharia.ts`.

## Global Constraints

- Não alterar silenciosamente orçamento, composição, produção, baseline ou versão aprovada.
- Matching é sugestão com score; nunca autolink automático.
- Preços aceitos devem guardar fonte, período, unidade, score e decisão auditável.
- Sem quantitativo ou unidade compatível, o sistema deve marcar pendência, não converter automaticamente.
- Toda publicação exige TypeScript, testes, CI e validação em Aurora Teste e Projeto Escola Arquimedes.

## Review Focus

- Composição semanticamente incompatível com a atividade: deve aparecer como revisão, não ser aceita.
- Unidade divergente: deve bloquear aceitação automática.
- Item fora da base oficial: deve permanecer como exceção identificada.
- Orçamento didático: deve ser distinguido de custo real.
- Nova versão: deve preservar a versão aprovada anterior e sua auditoria.

### Task 1: Diagnóstico e contrato de reconciliação

**Files:**
- Modify: `shared/price-sources/matching.ts`
- Test: `shared/price-sources/matching.test.ts`
- Create: `shared/price-sources/reconciliation.ts`

- [ ] Definir `ReconciliationCandidate` com código, descrição, unidade, preço, score, variação e motivo.
- [ ] Testar código exato, unidade incompatível, ausência de candidato e empate.
- [ ] Implementar retorno determinístico sem persistência.

### Task 2: Sugestões ligadas ao orçamento

**Files:**
- Modify: `server/routers.ts`
- Test: `server/routers.test.ts`

- [ ] Expor consulta tRPC para candidatos por item de orçamento e atividade atual.
- [ ] Reusar o catálogo versionado e a política de threshold existente.
- [ ] Retornar pendências sem modificar o orçamento.

### Task 3: Aceitar/rejeitar com auditoria

**Files:**
- Modify: `server/routers.ts`
- Modify: `drizzle/schema.ts` somente se o contrato atual não cobrir a decisão
- Test: `server/routers.test.ts`

- [ ] Persistir aceitação/rejeição, usuário, timestamp, score, fonte e variação em `projectAuditEvents`.
- [ ] Aceitação deve exigir unidade compatível e item ainda editável.
- [ ] Rejeição deve manter o item como exceção revisável.

### Task 4: Interface de revisão do orçamento

**Files:**
- Modify: `client/src/components/AbaOrcamento.tsx`
- Create/Modify: componente de candidatos de preço
- Test: `client/src/components/orcamento-edicao.test.ts`

- [ ] Exibir candidatos e motivos de pendência por item.
- [ ] Permitir aceitar/rejeitar individualmente.
- [ ] Mostrar claramente orçamento aprovado, didático, exceção e revisão pendente.

### Task 5: Regressão e publicação

**Files:**
- Modify: `.github/workflows/ci.yml` se necessário
- Test: suíte completa

- [ ] Validar Aurora: incompatibilidades continuam visíveis e produção permanece vinculada.
- [ ] Validar Escola: três atividades sem vínculo continuam sinalizadas e orçamento didático continua identificado.
- [ ] Rodar `pnpm check`, testes, build, CI e `/healthz`.
- [ ] Publicar somente após todos os checks passarem.

## Critério de conclusão

O MVP será considerado concluído quando o engenheiro conseguir consultar, revisar, aceitar ou rejeitar uma sugestão SEINFRA sem perder a versão aprovada, com auditoria persistida e alertas corretos nas duas obras de teste.
