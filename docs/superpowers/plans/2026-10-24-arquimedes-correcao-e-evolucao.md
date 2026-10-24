# Plano de Correção e Evolução — Agente Arquimedes

> **Para trabalhadores agentic:** SUB-SKILL REQUERIDO: usar subagent-driven-development (recomendado) ou executing-plans para implementar tarefa a tarefa. Passos usam `- [ ]`.

**Objetivo:** corrigir os defeitos de segurança/robustez encontrados na auditoria e evoluir o Arquimedes de "copiloto com regras no prompt" para "copiloto com governança estrutural", sem perder o motor determinístico que é o diferencial.

**Arquitetura:** manter o núcleo (orquestrador ReAct + motor determinístico + MCPs) e mover governança do prompt para o código; endurecer os freios (confirmação, escopo, memória) e adicionar observabilidade.

**Tech Stack:** TypeScript, Node 22, Express + tRPC 11, Drizzle ORM, PostgreSQL/Supabase, Zod, Vitest, React 19 + Vite.

**Spec:** esta auditoria (achados em `server/orchestrator.ts`, `server/agent/*`, `server/integrations/*`) no commit `3c3cb0c`.

**Versão auditada:** `3c3cb0c` · **Data:** 2026-10-24

## Restrições globais
- Nenhuma mudança de comportamento sem teste de regressão correspondente.
- Freios de segurança são **código**, nunca só prompt.
- Nenhuma escrita em produção/banco sem autorização explícita do usuário.
- Não quebrar o fluxo read-only (análise/consulta) — é o caminho mais usado.
- Commits pequenos e atômicos; `main` protegida (PR + `validate`/`schema-audit` verdes).

## Foco de revisão (o que os testes precisam pinar)
1. **Mutação sem confirmação** → deve ser barrada; com confirmação → passa.
2. **Mutação com verbo de operação mas sem proposta prévia** → barrada.
3. **Vazamento de memória** → `memoryRuns` limitado; conversas não vazam entre obras.
4. **Auto-edição do repo** → não-admin barrada; admin com flag → passa.
5. **MCP indisponível** → degrada com evidência, não inventa dado nem trava.

---

## Fase 0 — Correções de segurança (imediato, bloqueia evolução)

### T0.1 · Ligar a confirmação explícita no caminho de mutação  (ALTO)
**Arquivos:** `server/orchestrator.ts`
**Problema:** `hasExplicitMutationConfirmation` existe e nunca é chamada; mutação depende só do regex de intenção.
**Mudança:** no `executeTool`, antes de executar mutação, exigir confirmação explícita (proposta prévia + confirmação na conversa). Subir a proposta como ação `requiresConfirmation` e só executar após o usuário confirmar.
**Verificação:** teste que (a) mutação sem confirmação é barrada; (b) mutação com "confirmo/aplique" após proposta passa; (c) análise/consulta continua sem mutação.
**Commit:** `fix(agent): exigir confirmação explícita antes de mutar`

### T0.2 · Limitar `memoryRuns`  (MÉDIO)
**Arquivos:** `server/agent-execution.ts`
**Problema:** Map module-level sem eviction; só limpo em teste.
**Mudança:** remover a entrada ao final da execução (sucesso/falha/timeout) ou TTL + limite de tamanho.
**Verificação:** teste que, após N execuções, `memoryRuns` não cresce sem limite (ex.: size ≤ N e entradas terminais removidas).
**Commit:** `fix(agent): limitar memória de execuções em andamento`

### T0.3 · Gate de admin na auto-edição do repo  (MÉDIO)
**Arquivos:** `server/orchestrator.ts` (handler `repository_update_file`), `server/integrations/repository-tools.ts`
**Problema:** gate é flag global, não por usuário; `agent.chat` é `protectedProcedure`.
**Mudança:** exigir papel de admin (além de `ARQUIMEDES_SELF_EDIT_ENABLED`) no caminho da ferramenta; usuário sem admin recebe erro claro.
**Verificação:** teste que usuário comum é barrando e admin passa; teste de que flag desligada barra mesmo admin.
**Commit:** `fix(agent): exigir admin para auto-edição do repositório`

### T0.4 · Remover código morto  (BAIXO)
**Arquivos:** `server/agent/core/arquimedes.ts` (`selfHealGeneratedEap`)
**Problema:** `throw` final inalcançável (o `for` sempre retorna).
**Mudança:** remover o `throw` morto (ou reestruturar o laço).
**Verificação:** typecheck verde; `rg "Autocorreção da EAP terminou"` não retorna.
**Commit:** `refactor(agent): remover throw inalcançável da autocorreção`

### T0.5 · Transação na criação de atividade local  (BAIXO)
**Arquivos:** `server/orchestrator.ts` (`createLocalAgentActivity`)
**Problema:** múltiplas operações sem `db.transaction`.
**Mudança:** envolver a escrita (versão gravável + insert) em transação; manter audit/memória best-effort fora.
**Verificação:** teste que falha o insert → não sobra versão gravável órfã.
**Commit:** `fix(agent): transacionar criação de atividade local`

---

## Fase 1 — Provar os freios (testes de guarda)

### T1.1 · Teste da confirmação de mutação
**Arquivos:** `server/orchestrator.test.ts`
**Passos:** (1) escrever teste que mutação sem confirmação é barrada (RED); (2) rodar; (3) garantir que T0.1 faz passar (GREEN).
**Verificação:** os 3 casos do Foco de revisão #1/#2.

### T1.2 · Teste de evicção do `memoryRuns`
**Arquivos:** `server/agent-execution.test.ts`
**Verificação:** Foco #3.

### T1.3 · Teste do gate de admin no repo write
**Arquivos:** `server/orchestrator.test.ts`
**Verificação:** Foco #4.

### T1.4 · Teste dos guards existentes (regressão)
**Arquivos:** `server/integrations/construction-mcps.test.ts`
**Verificação:** MCP policy (readOnly/requiresConfirmation/destructive), `project_id` obrigatório, `"default"` bloqueado, circuit breaker dispara.

---

## Fase 2 — Arquitetura: governança no código, não no prompt

### T2.1 · Mover regras de prompt para o backend
**Arquivos:** `server/orchestrator.ts` (`buildSystem`), novo módulo `server/agent/governance/`
**Problema:** dezenas de regras defensivas no prompt (contagem, cobertura, causalidade, "não duplique").
**Mudança:** onde a regra é objetiva (contagem de cobertura, causalidade, não-duplicação), calcular no backend e **prover o número** como evidência; remover a regra equivalente do prompt.
**Verificação:** teste que a evidência chega com o número calculado; diff de prompt enxuto; regressão zero nas respostas (comparar saída antes/depois).
**Commit:** `refactor(agent): mover governança objetiva do prompt para o backend`

### T2.2 · Protocolo de confirmação (prévia + token + idempotência)
**Arquivos:** `server/orchestrator.ts`, `server/routers.ts` (router `agent`)
**Problema:** o roadmap Fase D existe no doc mas não no código.
**Mudança:** implementar intenção de mutação → prévia calculada (diff das entidades afetadas) → token de confirmação → idempotency key → execução transacional → pós-validação → memória da decisão.
**Verificação:** teste de ponta a ponta do ciclo (proposta → confirmação → aplicação → verificação) e de idempotência (replay não duplica).
**Commit:** `feat(agent): protocolo de confirmação com prévia e idempotência`

### T2.3 · Roteador de intenção mais robusto
**Arquivos:** `server/agent/runtime/intent-router.ts`
**Problema:** regex frágil; erro muda orçamento e gating.
**Mudança:** adicionar uma camada de confirmação **independente da intenção** (a mutação nunca depende só do regex) e/ou classifier mais robusto.
**Verificação:** tabela de casos (operação, análise com verbo de operação, READ_ONLY) → intenção esperada; teste de que mutação nunca é desbloqueada por intenção ambígua.
**Commit:** `fix(agent): tornar o roteador de intenção robusto`

---

## Fase 3 — Robustez operacional

### T3.1 · Observabilidade do agente
**Arquivos:** `server/agent-execution.ts`, `server/orchestrator.ts`, dashboard
**Mudança:** métricas por execução (provedor, modelo, iterações, ferramentas, latência, fallback, custo estimado) agregáveis; alerta de taxa de fallback alta.
**Verificação:** métrica aparece por execução; agregado por período.
**Commit:** `feat(agent): observabilidade das execuções`

### T3.2 · Higiene de memória
**Arquivos:** `server/agent/memory.ts`
**Problema:** memória nasce `proposed`; conversa e regra misturadas; sem evicção.
**Mudança:** ciclo de vida explícito (`proposed → approved → obsoleta`), separação conversa×regra validada, evicção/TTL.
**Verificação:** teste de que só `approved` entra no contexto; teste de isolamento entre obras.
**Commit:** `feat(agent): ciclo de vida e isolamento da memória`

### T3.3 · Limites de orçamento por intenção/obra
**Arquivos:** `server/orchestrator.ts`
**Mudança:** orçamento de iterações/tokens/custo por intenção e por obra; teto duro.
**Verificação:** teste de que o teto é respeitado (execução para no limite).
**Commit:** `feat(agent): tetos de orçamento por intenção e obra`

---

## Fase 4 — Higiene e documentação

### T4.1 · Alinhar docs ao código
**Arquivos:** `docs/AGENT-COORDINATOR-ARCHITECTURE.md`, `docs/AGENTS.md`
**Problema:** doc diz "DeepSeek é o motor" (código é provider-agnóstico, default `gpt-5-mini`); `AGENTS.md` cita URL Vercel.
**Mudança:** corrigir para refletir o código; remover URLs/nomes vencidos.
**Verificação:** `rg` não acha afirmações contraditórias ao código.
**Commit:** `docs: alinhar arquitetura e guia ao código`

### T4.2 · Docs como fonte de verdade
**Arquivos:** `docs/`
**Mudança:** marcar docs normativos vs. históricos; data + commit no cabeçalho; remover stale.
**Verificação:** cada doc tem data/commit; pendências citadas existem no código.
**Commit:** `docs: marcar normativo vs histórico`

---

## Fase 5 — Evolução de produto (contínua)

### T5.1 · Validação em produção (o que falta)
**O que:** observar o comportamento real do agente via logs (`agent_runs`/`agent_run_events`) — taxa de fallback, confirmações barradas, duração, erros.
**Por quê:** a auditoria é de código; o comportamento em produção é hipótese sem histórico.
**Verificação:** painel/relatório de execuções com as métricas de T3.1.

### T5.2 · Isolamento multi-obra
**Arquivos:** `server/agent/memory.ts`, testes
**O que:** provar que memória/contexto de uma obra não vaza para outra.
**Verificação:** teste de vazamento entre obras (o caso de sucesso do doc de arquitetura).

### T5.3 · Capacidades
**O que:** catálogo de capacidades com gates por usuário (não só global) e dependências.
**Verificação:** teste de instalação com dependência faltante barrada; capacidade desativada fora do contexto.

---

## Fase 6 — Evolução de UX e confiança (das melhores ideias de mercado)
Fonte: ALICE *Insights Agent*, GitHub Copilot (coding agent / mission control), Claude Code, Cursor, Windsurf/Devin *Agent Command Center*, Microsoft Project Copilot, nPlan, e padrões de HITL/UX/observabilidade. Cada item com ideia, origem e porquê.

### T6.1 · Fontes/evidência em toda resposta — ALICE
**Ideia:** toda resposta mostra a fonte do raciocínio (é o que faz o ALICE "quase não alucinar"). **No Arquimedes:** o dado já é calculado (`GAP-EVIDENCIA-VISIVEL`); expor o cartão de evidência na janela. **Esforço:** médio. **Prioridade:** alta.

### T6.2 · Diff por item antes de aplicar — Cursor
**Ideia:** diff lado a lado, aceitar/rejeitar por item, aplica só o aprovado. **No Arquimedes:** a proposta de mutação vira diff (antes/depois por entidade); aplicar só o aprovado. **Esforço:** médio/alto. **Prioridade:** alta.

### T6.3 · Painel de sessões / Kanban — Windsurf Agent Command Center
**Ideia:** um Kanban com todas as sessões de agente. **No Arquimedes:** os runs são assíncronos e invisíveis; um painel (executando / aguardando confirmação / concluído). **Esforço:** médio. **Prioridade:** média.

### T6.4 · Activity log separado do chat — agentic UX
**Ideia:** chat-first falha; o que funciona é plano + aprovação por risco + log de atividades separado. **No Arquimedes:** o log existe no backend; virar superfície inspecionável. **Esforço:** baixo/médio.

### T6.5 · Rollback/undo em um clique — agentic UX
**Ideia:** ação reversível tem undo tão rápido quanto a ação. **No Arquimedes:** reverter mutação de planejamento (há `projectPlanVersions`). **Esforço:** médio.

### T6.6 · Auto-revisão + checklist de segurança — Copilot coding agent
**Ideia:** o agente revisa o próprio trabalho e roda checks (segredos, dependências) antes de entregar. **No Arquimedes:** passada de auto-revisão + checklist de pre-flight visível. **Esforço:** baixo/médio.

### T6.7 · Comparação de versões / cenários — ALICE Difference Report
**Ideia:** relatório que narra o que mudou entre dois cenários (caminho crítico, marcos). **No Arquimedes:** diff narrativo entre `projectPlanVersions`. **Esforço:** médio/alto.

### T6.8 · What-if / simulação — ALICE
**Ideia:** simular cenários ("e se a produtividade cair 20%?"). **No Arquimedes:** o motor determinístico já calcula; expor simulação. **Esforço:** médio/alto.

### T6.9 · Nível de autonomia + safe-mode — agentic UX
**Ideia:** read-only / propõe / executa-com-aprovação. **Esforço:** médio.

### T6.10 · Observabilidade estruturada (100% + custo por usuário) — Langfuse/Sentry
**Ideia:** tracing estruturado (OpenTelemetry), amostragem 100% em agentes, custo por usuário. **No Arquimedes:** evoluir `agent_runs` para spans + custo por usuário. **Esforço:** médio.

---

## Ordem e dependências
1. **Fase 0** primeiro (segurança) — cada item é independente e pequeno.
2. **Fase 1** prova os freios da Fase 0 (T1.1 depende de T0.1).
3. **Fase 2** muda comportamento — só depois que os freios estão provados.
4. **Fases 3–4** em paralelo.
5. **Fase 5** contínua (validação em produção).
6. **Fase 6** evolução de produto/UX — entrar depois que os freios (Fases 0–2) estão sólidos; T6.1 e T6.2 são as de maior valor.

## Riscos e mitigação
| Risco | Mitigação |
|---|---|
| Ligar a confirmação quebra fluxo de mutação existente | feature flag + teste de regressão; liberar gradualmente |
| Mover regra do prompt para código muda comportamento | regressão zero por comparação campo a campo |
| Transação muda semântica de erro | manter mensagens de erro legíveis; testar os 3 casos |
| Gate de admin quebra uso legítimo | definir quem é admin; documentar |

## Critérios de pronto (por fase)
- Testes verdes (`pnpm check` + `pnpm test`) e comportamento observável.
- Fase 0: nenhum freio morto; `rg` confirma remoção.
- Fase 1: cada guard tem teste que dispara **e** não-dispara.
- Fase 2: prompt enxuto + protocolo com teste de ponta a ponta.
- Fases 3–5: métricas/docs/isolamento verificáveis.
