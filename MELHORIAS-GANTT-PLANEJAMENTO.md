# Melhorias do Gráfico Gantt — Alinhamento com Sistema de Planejamento de Obras

**Data:** 28 de setembro de 2026  
**Componente:** `GanttView.tsx` + CPM + Banco de Dados  
**Contexto:** Plataforma Obras baseada em Aldo Dórea Mattos

---

## 1. Análise do Estado Atual

### ✅ Pontos Fortes
- **Edição em tempo real**: drag-and-drop com recalculation imediata
- **Renderização eficiente**: SVG puro, escalável para milhares de atividades
- **Flexibilidade de visualização**: zoom, filtros, colunas customizáveis
- **CPM operacional**: algoritmo determinístico funcionando
- **Exportação**: PNG e PDF para relatórios

### ❌ Lacunas Críticas para Planejamento de Obras

#### 1.1 **Calendário de Trabalho** (CRÍTICO)
**Problema:** O Gantt usa dias corridos. Não respeita:
- Feriados municipais/estaduais/nacionais
- Fins de semana (sábado/domingo)
- Paradas programadas (festas, férias coletivas)

**Impacto:**
- Uma atividade de "3 dias" pode virar 4 dias reais (se cair num fim de semana)
- Datas planejadas fantasma (ex: "trabalho no domingo")
- Desvios de cronograma imperceptíveis no acompanhamento

**Solução Proposta:**
```
├─ Criar tabela de calendário: calendar (work_date, is_workday, reason)
├─ Integrar ao CPM: dias úteis em vez de dias corridos
├─ UI: mapa de cores no Gantt (weekend = cinza, feriado = pontilhado)
└─ Opção de "ignorar calendário" para cenários hipotéticos
```

**Esforço:** Médio (5-8 pontos)  
**Prioridade:** 🔴 CRÍTICO

---

#### 1.2 **Baselines Múltiplas + Comparação Visual** (IMPORTANTE)
**Problema:**
- Baseline existe no DB (`schedule_baselines`)
- Gantt não mostra a comparação: planejado vs atualizado vs realizado
- Impossível detectar desvios planejados visualmente

**Impacto:**
- Gestor não vê se o cronograma "fluiu" ou se desviou
- Desvios descobertos só via relatórios, não em tempo real

**Solução Proposta:**
```
├─ Visualização de múltiplas baselines (até 3 simultâneas)
│  ├─ Baseline planejada: barra cheia (cor primária)
│  ├─ Baseline congelada: barra tracejada (cinza), posição anterior
│  └─ Realizado: barra dupla (planejado + executado), cores contrastantes
├─ Legenda com código de cores
├─ Toggle: "Mostrar baselines"
└─ Tooltip com desvio em dias e %
```

**Exemplo de UI:**
```
Atividade A | [■■■ planejada] [- - - congelada 5d atrás] [● ● realizado]
```

**Esforço:** Médio (6-10 pontos)  
**Prioridade:** 🟠 IMPORTANTE

---

#### 1.3 **Slack/Folga Visual** (IMPORTANTE)
**Problema:**
- Atividades críticas são vermelhas ✓
- Folgas não são destacadas: folga total (buffer) e folga livre não aparecem

**Impacto:**
- Gestor não vê margem de segurança
- Mudanças em atividades com folga parecem impactantes quando não são

**Solução Proposta:**
```
├─ Cores de folga:
│  ├─ Crítica (folga = 0): 🔴 Vermelho (#c2181a)
│  ├─ Alto risco (folga < 5d): 🟠 Laranja (#ff9800)
│  ├─ Segura (folga >= 5d): 🟡 Amarelo (#ffd700)
│  └─ Muito segura (folga > 10d): 🟢 Verde claro (#90ee90)
├─ Mostrar folga total no tooltip: "Folga: 5 dias"
├─ Opção de colorir apenas crítica (atual) ou por folga (novo)
└─ Filtro: "Mostrar apenas atividades com folga < 3 dias"
```

**Esforço:** Baixo (2-3 pontos)  
**Prioridade:** 🟠 IMPORTANTE

---

#### 1.4 **Milestones (Marcos)** (IMPORTANTE)
**Problema:**
- Marcos são tratados como atividades normais (duração = 0)
- Visualmente, aparecem como barras finas ou desaparecem

**Impacto:**
- Difícil identificar marcos (gate de fases, entrega de clientes)
- Sem ênfase visual para pontos de controle críticos

**Solução Proposta:**
```
├─ Adicionar coluna de tipo no DB: activity.type (activity | milestone)
├─ Renderização especial:
│  ├─ Milestone: diamante ◆ ou pico ▲ na linha de tempo
│  ├─ Tamanho: ~16px
│  ├─ Cor: dourada (#ffd700) com sombra
│  └─ Sem barra, apenas ponto de data
├─ Tooltip: "Marco: [nome] - [data]"
└─ Filtro: "Mostrar apenas marcos"
```

**Exemplo no Gantt:**
```
Atividade A  [■■■■■]
Marco 1                      ◆
Atividade B        [■■■■■]
```

**Esforço:** Baixo (2-3 pontos)  
**Prioridade:** 🟠 IMPORTANTE

---

#### 1.5 **Alocação de Recursos Visual** (MÉDIO)
**Problema:**
- Recursos estão no DB (`schedule_allocations`)
- Gantt não mostra quem executa cada atividade

**Impacto:**
- Difícil detectar sobrecarga de recursos
- Sem visualização de capacidade/utilização

**Solução Proposta:**
```
├─ Adicionar coluna "Equipe" ao Gantt (customizável)
├─ Na barra: ícone + iniciais do responsável (ex: "JD")
├─ Tooltip expandido:
│  ├─ Responsável: João da Silva
│  ├─ Recurso: Carpinteiro (Mão de obra)
│  ├─ Alocação: 80% da capacidade
│  └─ Outros projetos: Atividade C (50%)
├─ Opção: "Modo ressource view"
│  ├─ Agrupar por responsável
│  ├─ Mostrar utilização (% da semana)
│  └─ Avisar sobre sobrecarga (> 100%)
```

**Esforço:** Médio (5-7 pontos)  
**Prioridade:** 🟡 MÉDIO

---

#### 1.6 **Restrições e Bloqueios** (MÉDIO)
**Problema:**
- Restrições (ex: "aguardando aprovação", "material não chegou") não aparecem
- Atrasos parecem inexplicáveis

**Impacto:**
- Falta de rastreabilidade de impedimentos
- Decisões sem contexto

**Solução Proposta:**
```
├─ Adicionar tabela: activity_constraints
│  ├─ constraint_type (approval_pending, material_delayed, etc)
│  ├─ start_date, end_date
│  └─ description
├─ No Gantt:
│  ├─ Ícone de aviso ⚠️ na barra
│  ├─ Barra com padrão pontilhado durante o bloqueio
│  └─ Tooltip: "[tipo]: [descrição] até [data]"
└─ Filtro: "Mostrar atividades bloqueadas"
```

**Esforço:** Médio (4-6 pontos)  
**Prioridade:** 🟡 MÉDIO

---

#### 1.7 **Linha de Balanço Integrada (LOB)** (MÉDIO)
**Problema:**
- LOB existe em componente separado (`GraficosView`)
- Impossível correlacionar ritmo planejado com avanço físico

**Impacto:**
- Duas visualizações desconexas
- Difícil ajustar ritmo de trabalho

**Solução Proposta:**
```
├─ Adicionar aba "LOB" dentro do Gantt
├─ Ou: sobrepor LOB como fundo translúcido no Gantt
│  ├─ Mostra produção esperada (%)
│  ├─ Compara com linha de realizado
│  └─ Identifica atraso visual
├─ Opção: "Sincronizar zoom Gantt ↔ LOB"
└─ Tooltip cruzado: atividade → LOB → progresso esperado
```

**Esforço:** Médio (6-8 pontos)  
**Prioridade:** 🟡 MÉDIO

---

#### 1.8 **Acompanhamento Real vs Planejado** (FUTURO - Etapa 8)
**Problema:** Estrutura pronta, mas implementação futura.

**Solução Proposta (roadmap):**
```
├─ Duas barras por atividade:
│  ├─ Superior: planejado (cor primária)
│  └─ Inferior: realizado (verde ou cinza)
├─ Desvio em dias mostrado no tooltip
├─ Linha de % de avanço comparativa
└─ Filtro: "Atividades em atraso > 2 dias"
```

**Esforço:** Alto (8-12 pontos)  
**Prioridade:** 🔵 ROADMAP

---

#### 1.9 **Agrupamento Hierárquico** (MÉDIO)
**Problema:**
- Apenas agrupado por WBS
- Obras grandes (100+ atividades) ficam desordenadas

**Impacto:**
- Navegação lenta
- Difícil contexto de fases

**Solução Proposta:**
```
├─ Agrupar por:
│  ├─ WBS (atual)
│  ├─ Fase (planejamento, execução, encerramento)
│  ├─ Responsável (equipe/engenheiro)
│  └─ Status (não iniciado, em curso, concluído)
├─ Collapse/expand de grupos
├─ Filtros dinâmicos: "Mostrar apenas Execução"
└─ Menu dropdown: "Agrupar por..."
```

**Esforço:** Médio (5-7 pontos)  
**Prioridade:** 🟡 MÉDIO

---

#### 1.10 **Indicadores de Risco** (MÉDIO)
**Problema:**
- Sem alertas visuais para atividades em atraso
- Gestão reativa

**Impacto:**
- Atrasos descobertos tarde

**Solução Proposta:**
```
├─ Comparar data de hoje vs data de realizado esperado
├─ Indicadores:
│  ├─ 🟢 No prazo: realizado >= esperado
│  ├─ 🟡 Aviso: realizado 1-3 dias abaixo
│  ├─ 🔴 Atraso: realizado > 3 dias abaixo
├─ Ícone na barra + tooltip: "Atraso de 5 dias"
└─ Filtro: "Mostrar apenas com atraso"
```

**Esforço:** Baixo (2-3 pontos)  
**Prioridade:** 🟡 MÉDIO

---

## 2. Matriz de Priorização

| # | Funcionalidade | Impacto | Esforço | Prioridade | Sprint |
|---|---|---|---|---|---|
| 1 | Calendário de trabalho | 🔴 Alto | M | 🔴 Crítico | S1 |
| 2 | Baselines visuais | 🔴 Alto | M | 🟠 Importante | S1 |
| 3 | Slack visual | 🟠 Médio | B | 🟠 Importante | S2 |
| 4 | Milestones | 🟠 Médio | B | 🟠 Importante | S2 |
| 5 | Recursos alocados | 🟠 Médio | M | 🟡 Médio | S3 |
| 6 | Restrições/bloqueios | 🟠 Médio | M | 🟡 Médio | S3 |
| 7 | LOB integrada | 🟡 Baixo | M | 🟡 Médio | S4 |
| 8 | Agrupamento hierárquico | 🟠 Médio | M | 🟡 Médio | S3 |
| 9 | Indicadores de risco | 🟡 Baixo | B | 🟡 Médio | S2 |
| 10 | Real vs planejado | 🔴 Alto | A | 🔵 Roadmap | S5+ |

---

## 3. Plano de Implementação por Sprint

### Sprint 1 (2-3 semanas)
**Objetivo:** Resolver críticos — calendário e baselines

#### 3.1.1 Calendário de Trabalho
**Tasks:**
```sql
-- 1. Criar tabela de calendário
CREATE TABLE work_calendar (
  id INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  work_date DATE NOT NULL,
  is_workday BOOLEAN DEFAULT TRUE,
  reason VARCHAR(100),
  UNIQUE KEY (project_id, work_date)
);

-- 2. Índice para busca rápida
CREATE INDEX idx_calendar_project_date ON work_calendar(project_id, work_date);
```

**Frontend:**
- UI para importar feriados (CSV ou via API pública)
- Botão: "Gerar calendário" (padrão: seg-sex, excluir fins de semana + feriados)
- Validação: "N dias úteis planejados"

**Backend:**
- Função: `calculateWorkdays(startDate, durationWorkdays)`
- Integrar ao CPM: usar workdays em vez de dias corridos
- Endpoint: `calendar.setWorkdays` (bulk import)

**Esforço:** 5-8 pontos

---

#### 3.1.2 Baselines Múltiplas + Visualização
**Tasks:**

**DB:**
```sql
-- Adicionar coluna se não existir
ALTER TABLE schedule_baselines ADD COLUMN display_order INT DEFAULT 0;

-- Marcar baseline atual
ALTER TABLE schedule_baselines ADD COLUMN is_current BOOLEAN DEFAULT FALSE;
```

**Frontend (GanttView.tsx):**
```tsx
// Estado
const [baselinesVisible, setBaselinesVisible] = useState<number[]>([]);
const [compareMode, setCompareMode] = useState<'overlay' | 'timeline'>;

// UI
<div>
  <label>Comparar baselines:</label>
  {baselines.map(b => (
    <input 
      type="checkbox" 
      key={b.id}
      onChange={e => setBaselinesVisible(...)}
    />
  ))}
  <select onChange={e => setCompareMode(e.target.value)}>
    <option>Sobreposição</option>
    <option>Timeline</option>
  </select>
</div>

// Renderização
{baselinesVisible.map(baselineId => {
  const baseline = baselines.find(b => b.id === baselineId);
  // Desenhar barra tracejada em posição histórica
  return <rect ... strokeDasharray="4,4" opacity={0.5} />;
})}
```

**Backend:**
- Endpoint: `planning.getBaselines` (com atividades de cada baseline)
- Cálculo de desvio: `(currentDate - baselineDate) / durationWorkdays * 100`

**Esforço:** 6-10 pontos

---

### Sprint 2 (1-2 semanas)
**Objetivo:** Melhorar clareza visual

#### 3.2.1 Slack Visual (Cores por Folga)
**Frontend (GanttView.tsx):**
```tsx
const getBarColor = (activity) => {
  if (activity.totalFloat === 0) return '#c2181a'; // Crítica: vermelho
  if (activity.totalFloat < 5) return '#ff9800'; // Alto risco: laranja
  if (activity.totalFloat < 10) return '#ffd700'; // Segura: amarelo
  return '#90ee90'; // Muito segura: verde
};

// Usar em <rect fill={getBarColor(activity)} />
```

**Esforço:** 2-3 pontos

---

#### 3.2.2 Milestones (Ícone Especial)
**DB:**
```sql
ALTER TABLE schedule_activities ADD COLUMN activity_type 
  ENUM('activity', 'milestone') DEFAULT 'activity';
```

**Frontend:**
```tsx
{rows.map(r => {
  if (r.activity_type === 'milestone') {
    return (
      <g key={`milestone-${r.id}`}>
        <polygon points={`${x},${y} ${x+8},${y-8} ${x+16},${y}`}
          fill="#ffd700" stroke="#cc9900"
        />
      </g>
    );
  }
  return <rect ... />; // Atividade normal
})}
```

**Esforço:** 2-3 pontos

---

#### 3.2.3 Indicadores de Risco
**Frontend (tooltip):**
```tsx
const getDaysLate = (activity, todayDate) => {
  const expectedDate = plannedStartDate + activity.duration;
  return Math.max(0, todayDate - expectedDate);
};

const getRiskLevel = (daysLate) => {
  if (daysLate === 0) return { icon: '🟢', label: 'No prazo' };
  if (daysLate <= 3) return { icon: '🟡', label: `${daysLate}d de aviso` };
  return { icon: '🔴', label: `${daysLate}d de atraso` };
};

// Tooltip
<title>{getRiskLevel(getDaysLate(r, today)).label}</title>
```

**Esforço:** 2-3 pontos

---

### Sprint 3 (2-3 semanas)
**Objetivo:** Adicionar contexto operacional

#### 3.3.1 Alocação de Recursos
**Frontend:**
```tsx
// Coluna adicional
{cols.recurso && <th>Recurso</th>}

// Célula com ícone
{cols.recurso && r.allocations?.length > 0 && (
  <td>
    <span title={r.allocations.map(a => a.resourceName).join(', ')}>
      👤 {r.allocations[0].resourceShortName}
    </span>
  </td>
)}

// Tooltip na barra
<title>
  {r.name} | Recurso: {r.allocations?.map(a => `${a.name} (${a.utilization}%)`).join(', ')}
</title>
```

**Backend:**
- Query: `planning.list` já deve incluir allocations
- Cálculo de utilização: `sum(allocation % per week) / 100`

**Esforço:** 5-7 pontos

---

#### 3.3.2 Restrições/Bloqueios
**DB:**
```sql
CREATE TABLE activity_constraints (
  id INT PRIMARY KEY AUTO_INCREMENT,
  activity_id INT NOT NULL,
  constraint_type ENUM('approval_pending', 'material_delayed', 'weather', 'other'),
  start_date DATE,
  end_date DATE,
  description VARCHAR(255),
  FOREIGN KEY (activity_id) REFERENCES schedule_activities(id)
);
```

**Frontend:**
```tsx
{rows.map(r => {
  if (r.constraints?.length > 0) {
    const constraint = r.constraints[0];
    return (
      <g>
        <rect ... strokeDasharray="2,2" /> {/* Padrão pontilhado */}
        <text ... >⚠️</text> {/* Ícone */}
        <title>{constraint.constraint_type}: {constraint.description}</title>
      </g>
    );
  }
})}
```

**Esforço:** 4-6 pontos

---

### Sprint 4+ (Roadmap)
- **S4:** LOB integrada, agrupamento hierárquico
- **S5+:** Real vs planejado (Etapa 8)

---

## 4. Guia de Implementação Técnica

### 4.1 Mudanças no Schema (Drizzle)

```typescript
// client/src/components/GanttView.tsx
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";

// Tipos expandidos
type Activity = {
  // ... existentes
  activity_type?: 'activity' | 'milestone';
  totalFloat?: number;
  allocations?: { resourceId: number; resourceName: string; utilization: number }[];
  constraints?: { constraint_type: string; description: string; end_date: string }[];
  earlyStart?: number;
  lateStart?: number;
};

// Estado adicional
const [compareBaselines, setCompareBaselines] = useState<number[]>([]);
const [slackColorMode, setSlackColorMode] = useState<'critical' | 'slack'>(
  'critical'
);
```

### 4.2 Renderização SVG Expandida

```typescript
const renderActivityBar = (activity: Activity, row: Row, posById) => {
  const color = slackColorMode === 'slack'
    ? getSlackColor(activity.totalFloat)
    : (activity.critical ? '#c2181a' : '#1a6ce5');

  if (activity.activity_type === 'milestone') {
    // Renderizar como diamante
    return <polygon points={...} fill={color} />;
  }

  // Atividade normal
  return (
    <g>
      <rect fill={color} {...} />
      {/* Barra de progresso */}
      <rect fill="#1e8a4f" width={...} />
      
      {/* Renderizar baseline comparativa se visível */}
      {compareBaselines.includes(baselineId) && (
        <rect ... strokeDasharray="4,4" opacity={0.5} />
      )}
      
      {/* Ícone de restrição */}
      {activity.constraints?.length > 0 && (
        <text x={...} y={...}>⚠️</text>
      )}
      
      {/* Ícone de recurso */}
      {activity.allocations?.length > 0 && (
        <circle cx={...} cy={...} r="4" fill="#gold" />
      )}
    </g>
  );
};
```

### 4.3 Integração com CPM

```typescript
// server/construction/cpm-calculator.ts
import { WorkCalendar } from "../db/schema";

export function calculateDeterministicCpm(
  activities: Activity[],
  dependencies: Dependency[],
  workCalendar?: WorkCalendar[]
): DeterministicCpmResult {
  const schedule = calculateCpm(
    activities.map(a => ({
      id: String(a.id),
      duration: a.durationDays,
      // Novo: usar workdays se calendário disponível
      workDays: workCalendar
        ? countWorkDays(a.startDate, a.durationDays, workCalendar)
        : a.durationDays,
    })),
    dependencies
  );
  return { valid: true, schedule, issues: [] };
}

function countWorkDays(
  startDate: Date,
  workDays: number,
  calendar: WorkCalendar[]
): number {
  let count = 0;
  let current = new Date(startDate);
  while (count < workDays) {
    if (calendar.find(c => c.date === current && c.isWorkday)) count++;
    current.setDate(current.getDate() + 1);
  }
  return current.getTime() - startDate.getTime();
}
```

---

## 5. Checklist de Validação

- [ ] CPM recalcula corretamente com calendário de trabalho
- [ ] Baselines antigas não desaparecem ao atualizar
- [ ] Cores de slack correspondem às folgas no CPM
- [ ] Milestones não podem ser arrastados
- [ ] Restrições impedem movimento (ou permitem com aviso)
- [ ] Recursos alocados aparecem no tooltip
- [ ] Exportação PNG/PDF preserva cores e elementos novos
- [ ] Performance não degrada com 500+ atividades
- [ ] Responsivo em telas < 1024px

---

## 6. Roadmap a Longo Prazo

```
Sprint 1-2: Fundação (calendário, baselines, cores)
Sprint 3: Contexto (recursos, restrições)
Sprint 4: Integração (LOB, agrupamento)
Sprint 5+: Acompanhamento (real vs planejado, relatórios)
```

---

## 7. Referências

- Aldo Dórea Mattos: "Planejamento e Controle de Obras"
- CPM (Critical Path Method): ISO 21502:2020
- Linha de Balanço: LOB scheduling method
- Calendário de trabalho: PRINCE2 / PMI standards

---

**Próximos passos:** Validar prioridades com stakeholders e iniciar Sprint 1.

