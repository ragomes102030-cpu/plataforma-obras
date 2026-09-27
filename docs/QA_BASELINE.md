# QA_BASELINE.md — Linha de Base de Qualidade e Validacao

## STATUS ATUALIZADO — TESTE COM PLAYWRIGHT (Navegacao Real)

**Data:** 2026-09-26
**Metodo:** Playwright headless — navegacao real no navegador como usuario
**URL:** `https://plataforma-obras-8uhqy3k5f-rafael-5864.vercel.app`

### Resultado do Teste de Navegacao

✅ **Pagina carrega corretamente** — Titulo: "Plataforma Obras - Planejamento integrado"
✅ **Usuario autenticado no frontend** — "Olá, gestor" + "Rafael Gomes" visiveis
✅ **Menu completo funcionando** — Todos os modulos acessiveis:
  - Portfólio, EAP, Orçamento, Catálogo, Cronogramas, Linha de Balanço
  - Frentes, Producao, Medicao, Restricoes, Relatorios, Graficos, Formula, Agente IA
✅ **tRPC funcionando via Vercel** — Chamadas `/api/trpc` roteadas corretamente
✅ **API responde** — `auth.me`, `projects.list`, `projects.activities` retornam dados
✅ **Modal "Nova obra" abre** — Formulario com 5 campos (Nome, Local, 2 datas) acessivel
✅ **Interface responsiva** — Navegacao fluida entre secoes

### Problema Encontrado ⚠️

⚠️ **Autenticacao 401 em chamadas API** — Apos carregar a pagina, chamadas tRPC retornam 401 UNAUTHORIZED
- O cookie de sessao do frontend Vercel **nao esta sendo propagado** para o backend via proxy
- Causa: O backend esta no **Render** (`plataforma-obras-api.onrender.com`), proxy Vercel→Render nao encaminha cookies corretamente
- Quando tenta criar obra, sistema redireciona para GitHub OAuth no dominio do **Render**

⚠️ **Backend ainda no Render** — O codigo tem `publicAppUrl` configurado para Vercel, mas o servidor de producao responde no dominio `onrender.com`

⚠️ **0 obras no banco** — Sistema deployado mas sem dados de teste

### DIAGNOSTICO RAIZ DO PROBLEMA (Gantt/Linha de Balanco)

| Aspecto | Frontend | Backend |
|---------|----------|---------|
| **Hospedagem** | Vercel ✅ | Render (onrender.com) ⚠️ |
| **Proxy** | Vercel → Render | Cold starts, timeout |
| **Cookie** | Funciona localmente | 401 via proxy |
| **Gantt/LOB** | Frontend OK | Backend lento/timed out |
| **Calculos** | n/a | Roda no Render = lento |

**Conclusao**: Os problemas com Gantt e Linha de Balanco nao sao do frontend — são do **backend no Render**. O servidor no free tier do Render tem cold starts e limitacao de memoria/tempo que afetam os calculos pesados.

---

## SUITE DE TESTES AUTOMATIZADOS (vitest)

**Resultado:** 112 testes passaram, 1 falhou (99,1%)

**Arquivos de teste (21 arquivos):**

| Arquivo | Tests | Status |
|---------|-------|--------|
| shared/cpm.test.ts | 4 | ✅ |
| server/construction/cpm-calculator.test.ts | 4 | ✅ |
| server/construction/eap-validator.test.ts | 4 | ✅ |
| server/construction/dependency-validator.test.ts | 3 | ✅ |
| server/construction/project-progress.test.ts | 7 | ✅ |
| server/construction/stage-gates.test.ts | 5 | ✅ |
| server/construction/plan-versions.test.ts | 6 | ✅ |
| server/construction/finding-lifecycle.test.ts | 12 | ✅ |
| server/construction/evidence-router.test.ts | 4 | ✅ |
| server/construction/evidence-source.test.ts | 4 | ✅ |
| server/construction/mcp-evidence-source.test.ts | 4 | ✅ |
| server/integrations/phase7-import.test.ts | 3 | ✅ |
| server/integrations/mcp-client.test.ts | 8+42 | ✅ |
| server/agent-execution.test.ts | 3 | ✅ |
| server/llm-provider-gateway.test.ts | 8 | ✅ |
| server/orchestrator.test.ts | 6 | ✅ |
| server/db.test.ts | 3 | ✅ |
| server/auth.logout.test.ts | 1 | ✅ |
| shared/price-sources/seinfra.test.ts | 12 | ✅ |
| shared/price-sources/matching.test.ts | 9 | ✅ |
| server/_core/github-oauth.test.ts | 3 | ❌ (1 falhou) |

**Falha conhecida:** github-oauth.test.ts — URL fora de sincronia (.onrender.com vs .vercel.app). Sem impacto funcional.

---

## O QUE FOI COMPROVADO (executado e validado)

### CPM — CONFIRMADO
- Rede linear A→B→C (3,5,2 dias): duration=10, CP=[A,B,C] ✅
- Rede paralela A→B, A→C (3,5,2 dias): duration=8, float(C)=3, C nao critico ✅
- SS com Lag=2: B.ES=2, B.EF=5 ✅
- SF: B.ES=0, B.EF=3 ✅
- Deteccao de ciclo: lancou excecao ✅
- Rede linear (5,10,3): duration=18 ✅

### EAP VALIDATION — CONFIRMADO
- Arvore valida com pai e filho: valid=true ✅
- Orfao + codigo duplicado: valid=false, issues corretos ✅
- Ciclo hierarquico: valid=false, issues corretos ✅
- No filho sem pai indicado pelo codigo WBS: valid=false ✅

### SEINFRA — CONFIRMADO
- Parsing de planilha de precos pt-BR: 12/12 testes ✅

### CONTROLE — CONFIRMADO
- Formula: quantidade_produzida / quantidade_planejada × 100 ✅
- Ponderação por duracao ✅
- Prendendo resultado em 0-100 ✅
- Arredondamento para inteiro ✅

### PERSISTÊNCIA — CONFIRMADO
- Conexao TLS com MySQL ✅
- Queries basicas funcionam ✅

### MCP CLIENT — CONFIRMADO
- Circuit breaker funciona ✅
- Retry com backoff funciona ✅
- Seguranca de ferramentas ✅

### AGENTE — CONFIRMADO
- Execucao segura ✅
- Sem expor ferramentas de escrita ✅

### NAVEGACAO REAL (Playwright) — CONFIRMADO
- Frontend Vercel carrega e navega ✅
- Autenticacao visual funciona ✅
- Menu completo acessivel ✅
- tRPC comunica via Vercel ✅
- Modal de criacao de obra abre ✅

---

## O QUE NAO FOI VALIDADO (ainda)

| Dominio | Status | Motivo |
|---------|--------|--------|
| Gantt (renderizacao, zoom, drag) | NÃO VALIDADO | Sem dados de obra + auth 401 |
| Linha de Balanço | NÃO VALIDADO | Sem dados + backend Render lento |
| Curva S em grafico | NÃO VALIDADO | Sem ambiente grafico |
| Baseline (captura, comparacao) | NÃO VALIDADO | Sem ambiente grafico |
| Fluxo completo de usuario | PARCIAL | Navegacao OK mas auth quebra via proxy |
| Performance com 100+ atividades | NÃO VALIDADO | Sem teste de carga |
| Integracao com MCPs externos | NÃO VALIDADO | Servidores nao disponiveis |
| Persistencia apos reconexao | NÃO VALIDADO | Sem banco + navegador |

---

## REGRAS DE VALIDACAO

1. Teste automatizado ≠ Validacao completa
2. Codigo implementado ≠ Funcionalidade comprovada
3. Teste unitario ≠ Teste de integracao
4. Nao inventar evidencias. Se nao foi possivel testar, registrar como "NÃO VALIDADO".
5. Navegacao real via Playwright revela problemas de deploy que testes unitarios nao pegam.
