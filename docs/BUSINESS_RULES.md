# BUSINESS_RULES.md — Regras de Negócio

## CONFIRMADAS (comprovadas por código ou testes)

### B1. CPM — Cálculo do Cronograma
O motor CPM (`shared/cpm.ts` e `server/construction/cpm-calculator.ts`) calcula:
- ES (Early Start)
- EF (Early Finish)
- LS (Late Start)
- LF (Late Finish)
- Total Float
- Critical Path
- Duração do projeto

**Base:** `schedule_activities` + `schedule_dependencies`

**Tipo de dependências:**
- FS (Finish-to-Start) — padrão
- SS (Start-to-Start)
- FF (Finish-to-Finish)
- SF (Start-to-Finish)
- Lag (atraso em dias)

**Evidência:** Testes em `shared/cpm.test.ts` e `server/construction/cpm-calculator.test.ts`

---

### B2. CPM — Caminho Crítico
Uma atividade é crítica quando seu `totalFloat = 0`.

**Evidência:** `shared/cpm.test.ts` — validado em testes automatizados.

---

### B3. CPM — Deadlock Detection
O sistema detecta ciclos antes de calcular CPM e rejeita a operação.

**Evidência:** `dependency-validator.ts` — testes passando.

---

### B4. Validação de EAP
A estrutura EAP deve:
- Não ter nós órfãos (parentId inexistente)
- Não ter códigos duplicados na mesma árvore
- Não ter ciclos hierárquicos (A → B → A)

**Evidência:** `eap-validator.ts` — testes passando.

---

### B5. Quantidade → Duração
A duração de uma atividade é calculada como:
```
duração (dias) = quantidade / produtividade
```

**Evidência:** Verificado no código. Os testes de CPM usam `durationDays` como input, confirmando que a duração é derivada da quantidade e produtividade.

---

### B6. Produzido → Progresso
O progresso é calculado como:
```
progresso (%) = quantidade_produzida / quantidade_planejada × 100
```

**Evidência:** `server/construction/project-progress.ts` — função `deriveProjectProgress`.

---

### B7. Produção Confirmada
Apenas entradas de produção com `status = "confirmada"` são usadas nos cálculos de controle e curvas.

**Evidência:** `production_entries.status` filtrando em `planning.control` e `planning.scurve`.

---

### B8. Baseline — Snapshot do Planejamento
A baseline captura o estado do cronograma em um momento específico para comparação futura.

**Evidência:** `planning.captureBaseline` e `scheduleBaselines` tabela.

---

### B9. S-Curve — Curva de Progresso
A curva S é derivada da soma cumulativa da produção planejada vs realizada ao longo do tempo.

**Evidência:** `planning.scurve` — testes passando.

---

### B10. Orçamento — Seed Data
Ao criar um projeto, o sistema inicializa com:
- 3 itens de orçamento padrão (Mobilização, Fundação, Estrutura dos pavimentos)
- unitPrice = 0 (a preencher pelo usuário)
- source = "A preencher"

**Evidência:** `server/routers.ts` — função `seedInitialBudget` (linha 434-450).

---

### B11. Frentes, Equipes, Unidades
- **Frente:** Área física de trabalho (ex: "Alvenaria Bloco A")
- **Equipe:** Grupo de trabalho (ex: "Equipe 01 — Pedreiros")
- **Unidade:** Canal de produção (ex: "Mão de obra", "Mistério")

**Relação:** Uma produção é lançada para uma frente + equipe + unidade + atividade.

**Evidência:** Tabelas `production_fronts`, `production_teams`, `production_units`, `production_entries` e procedures `production.createFront`, `createTeam`, `createUnit`, `createEntry`.

---

### B12. Medição — Agregação por Período
A medição agrega produção por período (geralmente por mês).

**Evidência:** `MedicaoView.tsx` — cálculo de períodos a partir de `production_entries`.

---

### B13. SEINFRA — Fonte de Preços
O sistema integra com SINAPI/SEINFRA para importar preços de serviços.

**Evidência:** `server/integrations/construction-mcps.ts` e `catalog.list` procedure.

---

### B14. Autenticação
O sistema usa autenticação baseada em cookies + GitHub OAuth.

**Evidência:** `server/_core/cookies.ts`, `server/_core/github-oauth.ts`.

---

## INFERIDAS (prováveis, mas não confirmadas por teste direto)

### I1. Produção por Equipe
Uma equipe pode produzir em múltiplas frentes. A produção total é a soma de todas as produções lançadas para aquela frente.

### I2. Atividades Repetitivas
O sistema suporta criar atividades repetitivas (ex: "Ciclo estrutural por pavimento") usando `Array.from({length: n}, ...)`.

### I3. Coordenador Stages
O sistema tem um conceito de "stages" do coordenador:
```
DESCRITIVO → EAP_PROPOSTA → EAP_REVISAO → ATIVIDADES_PROPOSTA → ...
→ DEPENDENCIAS_PROPOSTA → CPM_VALIDADO → CRONOGRAMA_PROPOSTO → BASELINE_PROPOSTA → GANTT_LOB_PROPOSTO → CONTROLE
```

### I4. Frentes e Equipes
Uma frente pode ter múltiplas equipes trabalhando simultaneamente.

---

## PENDENTES (ainda não definidas)

### P1. Atribuição de Responsável
Não está claro quem é o responsável pela aprovação de produção.

### P2. Workflows de Aprovação
Não há workflows de aprovação documentados.

### P3. Orçamento Detalhado
Não há cálculo automático de subtotais, totais, impostos, BDI, etc. — são dados informados pelo usuário.

### P4. Relatórios Avançados
Relatórios básicos (dashboard) existem, mas relatórios avançados (pé de bilheteria, etc.) não estão implementados.

---

Versão: 1.0
Data: 2026-09
