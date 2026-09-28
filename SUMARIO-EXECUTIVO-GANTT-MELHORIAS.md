# 📊 Sumário Executivo: Melhorias do Gantt

**Plataforma Obras — 28 de setembro de 2026**

---

## 🎯 O Que Falta no Gantt Hoje

Seu Gantt está **M5/M6** (edição + exportação), mas 3 funcionalidades críticas faltam:

### 🔴 **Prioridade P0 — Impeditivos**

```
┌─────────────────────────────────────────────────────────────┐
│ 1️⃣  COMPARAÇÃO BASELINE × PLANO ATUAL (Não visível)        │
│    → Você não sabe se desviou do planejado                │
│    → Variação de prazo é "dado fantasma"                  │
│    Solução: Barra dupla + cores de desvio (3 dias)        │
│                                                             │
│ 2️⃣  RESTRIÇÕES BLOQUEANDO ATIVIDADES (Não são mostradas)   │
│    → Fundação travada por aprovação (ninguém vê)          │
│    → Decisões não comunicam impacto visual                 │
│    Solução: Ícone 🔒 + cores de status (3 dias)           │
│                                                             │
│ 3️⃣  CALENDÁRIO REALISTA (Usa dias corridos)                │
│    → Prazos ignoram fins de semana e feriados             │
│    → Incompatível com SINAPI (dias úteis)                 │
│    Solução: Integração com calendário de trabalho (4 dias)│
└─────────────────────────────────────────────────────────────┘
```

### 🟡 **Prioridade P1 — Operacionais (Depois)**

| # | Falta | Impacto | Esforço |
|---|---|---|---|
| 4 | **Slack/Folga Livre** | Planejador não vê margem de segurança | 2d |
| 5 | **Linha de Balanço Integrada** | Ritmo é análise fora do contexto | 5d |
| 6 | **Milestones Especiais** | Marcos não se destacam | 2d |
| 7 | **Alocação de Equipe Visível** | Conflito de sobrecarga é manual | 4d |
| 8 | **Realizado vs Planejado** | Acompanhamento é pré-histórico | 5d* |
| 9 | **Agrupamento por Fase** | Milhares de atividades se perdem | 3d |
| 10 | **Indicadores de Risco** | Gestão reativa, não proativa | 2d |

*Depende da Etapa 8 (Medição)

---

## 📈 Impacto no Projeto

### Antes (Hoje)

```
Planejador abre Gantt
    ↓
Vê atividades e prazos
    ↓
❌ Não sabe por que desviou
❌ Não vê bloqueios
❌ Não vê sobrecarga de equipe
❌ Prazos são irrealistas (sem feriados)
    ↓
Resultado: Gestão reativa, surpresas
```

### Depois (Com Melhorias)

```
Planejador abre Gantt
    ↓
Vê atividades, prazos, variações, bloqueios
    ↓
✅ Desvio é visível (cor + tooltip)
✅ Restrições comunicam impacto
✅ Sobrecarga é detectada (heatmap)
✅ Prazos 100% realistas (calendário)
✅ Ritmo de equipe integrado (LOB)
    ↓
Resultado: Gestão proativa, precisão
```

---

## 📊 Roadmap Executável

### **Fase 1 — Fundação (1-2 semanas)**
Implementar as 3 prioridades P0:
- ✅ Comparação baseline (desvios visíveis)
- ✅ Restrições visuais (bloqueios comunicados)
- ✅ Indicadores de risco (gestão pelo exceção)

**Resultado:** Desvios deixam de ser surpresa

### **Fase 2 — Calendário e Recursos (3-4 semanas)**
- ✅ Calendário de trabalho (prazos realistas)
- ✅ Alocação de equipe (detecção de sobrecarga)
- ✅ Agrupamento por fase (navegação intuitiva)

**Resultado:** Prazos 100% confiáveis; recursos balanceados

### **Fase 3 — Operacional (5-6 semanas)**
- ✅ Slack/folga visível (margem de segurança)
- ✅ Milestones diferenciados (marcos destacados)
- ✅ LOB integrada (ritmo de equipe)

**Resultado:** Planejamento operacional integrado

---

## 💡 Exemplos de Uso (Antes vs Depois)

### Caso 1: Desvio de Prazo

**Antes:**
```
Planejador: "Por que a fundação saiu de prazo?"
Sistema: *silence*
Planejador: Abre Excel, compara manualmente
```

**Depois:**
```
Planejador abre Gantt
Vê barra vermelha: "Fundação: +5 dias de atraso"
Tooltip mostra: "Baseline: 15/10, Atual: 20/10"
Clica em detalhes: Mostra a restrição que bloqueou
```

---

### Caso 2: Bloqueio de Projeto

**Antes:**
```
Engenheiro: "Fundação aguarda aprovação"
Planejador: Não vê no Gantt, segue atualizando
Surpresa na semana 4: "Ah, esqueci que fundação estava bloqueada"
```

**Depois:**
```
Atividade "Escavação" tem ícone 🔒
Tooltip: "Bloqueio: Aprovação de projeto (Engenheiro Rafaela)"
Estado: "Vencido desde 2026-09-20"
Alertas no painel: "Restrição ativa — resolver hoje"
```

---

### Caso 3: Sobrecarga de Equipe

**Antes:**
```
Planejador: "Equipe Estrutura consegue fazer Pilares + Vigas?"
Resposta: Manual, baseada em intuição
Realidade: Equipe 150% alocada, atraso garantido
```

**Depois:**
```
Checkbox: "Mostrar carga de equipe"
Heatmap aparece: Semana 43 está vermelha (150%)
Sugestão automática: "Mover Vigas para semana 44"
Planejador confirma e recalcula CPM
```

---

## 📋 Entregáveis Detalhados

### Fase 1 (8 dias)

| Item | Entrega | Código |
|---|---|---|
| Comparação Baseline | Barra dupla + cores + resumo | `GanttComparison.tsx` |
| Restrições | Tabela DB + ícones 🔒 + alertas | `ActivityConstraints` routes |
| Indicadores | Status enum + cores + filtros | `schedule_activities.operationalStatus` |

**Resultado Validável:** Exportar Gantt com desvios destacados ✅

### Fase 2 (11 dias)

| Item | Entrega | Código |
|---|---|---|
| Calendário | Tabela + função de cálculo realista | `work_calendars` table |
| Alocação | Badges + heatmap + alertas | `TeamLoadHeatmap.tsx` |
| Agrupamento | UI de groupBy + árvore colapsível | `GanttGrouping.tsx` |

**Resultado Validável:** Prazos coincidem com SINAPI ✅

### Fase 3 (9 dias)

| Item | Entrega | Código |
|---|---|---|
| Slack | Coluna + renderização visual | `schedule_activities.totalFloat` coluna |
| Milestones | Diamantes + tipos | `schedule_activities.isMilestone` |
| LOB | Sincronização + overlay opcional | `GanttLobIntegration.tsx` |

**Resultado Validável:** Ritmo de equipe visível no Gantt ✅

---

## 🔄 Integração com Etapas Futuras

```
Etapa 7 (HOJE): Gantt + Baseline
         ↓
┌────────┴────────┐
│  Melhorias (3+6) │  ← Este documento
│  • Comparação   │
│  • Restrições  │
│  • Calendário  │
│  • Equipes     │
│  • LOB         │
└────────┬────────┘
         ↓
Etapa 8 (4 semanas): Medição + Realizado vs Planejado
         ↓
Etapa 9+: Ações Assistidas + Sincronização MCP
```

**Compatibilidade:** Melhorias não bloqueiam Etapa 8; podem ser paralelas

---

## 🎯 Critérios de Sucesso

Após implementação:

| Métrica | Antes | Depois |
|---|---|---|
| Detecção de desvio | Manual (∞ tempo) | <5 min (visível) |
| Bloqueios comunicados | 0% | 100% visual |
| Replanejamento | 2–4 horas | <1 hora |
| Prazos realistas | 50% | 95%+ |
| Sobrecarga detectada | Manual | Automática |

---

## 💰 ROI Esperado

| Fase | Investimento | Ganho |
|---|---|---|
| **Fase 1** | 8 dev-dias | -50% tempo de detecção de desvio |
| **Fase 2** | 11 dev-dias | +95% confiabilidade de prazos |
| **Fase 3** | 9 dev-dias | Ritmo operacional integrado |
| **Total** | **28 dev-dias** | **Planejamento proativo + confiável** |

Referência: 1 dia de replanejamento urgente (hoje) = 1 dev-dia + atraso de 3–5 dias na obra.

---

## 🚀 Próximos Passos

1. **Esta semana**: Aprovação de roadmap
2. **Semana 1**: Iniciar Fase 1 (comparação baseline)
3. **Semana 2**: Completar Fase 1, revisar com usuários piloto
4. **Semana 3–4**: Fase 2 (calendário em paralelo com Etapa 8)
5. **Semana 5–6**: Fase 3 + Etapa 8 integradas

---

## 📎 Documentação Completa

Veja arquivo detalhado: **`ANALISE-GANTT-E-MELHORIAS-2026-09-28.md`**

Contém:
- ✅ Análise técnica de cada melhoria
- ✅ Propostas de DB (DDL)
- ✅ Exemplos de código
- ✅ Checklist de implementação
- ✅ Testes unitários
- ✅ Roadmap de commits

---

**Documento Preparado Para:** Equipe de Produto Obras  
**Status:** Pronto para Prioritização  
**Próxima Revisão:** 2026-10-05

