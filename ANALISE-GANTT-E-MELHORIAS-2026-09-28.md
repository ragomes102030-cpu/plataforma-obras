# Análise e Melhorias do Gráfico Gantt — Plataforma Obras

**Data:** 28 de setembro de 2026  
**Autor:** Railway Agent  
**Projeto:** Plataforma Obras (plataforma-obras-staging)  
**Arquivo Analisado:** `client/src/components/GanttView.tsx` (21 KB)

---

## Resumo Executivo

A implementação atual do Gantt (**GanttView.tsx**) está em nível M5–M6 (edição e exportação). É uma ferramenta operacional sólida com suporte a CPM, baselines e Linha de Balanço. Porém, faltam **dez melhorias críticas** para alinhar o Gantt com o sistema de planejamento de obras (metodologia Aldo Dórea Mattos) e trazer visibilidade completa do plano versus realizado.

**Impacto:** As melhorias propostas aumentarão a precisão de prazos (calendário), a rastreabilidade de risco (restrições visuais) e a produtividade do planejador (ritmo integrado).

---

## 1. ESTADO ATUAL: FORÇAS E FRAQUEZAS

### ✅ Forças

| Aspecto | Detalhe |
|---|---|
| **Interatividade** | Drag-and-drop para mover/redimensionar; clique para ligar dependências |
| **Visualização** | Zoom (dia/semana/mês); scroll horizontal/vertical; cores (crítica/normal) |
| **Dependências** | FS, SS, FF, SF com lag; setas visuais com tipos |
| **Progresso** | Barra verde sobreposta; % visível na tabela |
| **Exportação** | PNG e PDF para relatórios |
| **Filtros** | Atividades críticas; colunas customizáveis |
| **Baselines** | Conceito de baseline congelada (DB: `schedule_baselines`) |
| **API Real-time** | Atualização via tRPC; recálculo CPM on-demand |
| **WBS Integrada** | Vínculo com `wbsNodes` e códigos EAP |
| **CPM Completo** | earlyStart, earlyFinish, lateStart, lateFinish, totalFloat armazenados |

### ❌ Fraquezas (Melhorias Prioritárias)

| Prioridade | Problema | Impacto | Esforço |
|---|---|---|---|
| **🔴 P0** | Sem calendário de trabalho (dias corridos, sem feriados/fins de semana) | Prazos irreais em % do cronograma | Alto |
| **🔴 P0** | Sem comparação visual baseline vs plano atual | Imposível detectar variação de prazo | Médio |
| **🔴 P0** | Sem restrições visuais (bloqueios que travam atividades) | Risco não é comunicado graficamente | Médio |
| **🟡 P1** | Sem slack/folga livre visível | Planejador não vê margem de segurança | Baixo |
| **🟡 P1** | Sem Linha de Balanço integrada ao Gantt (está separada) | Ritmo de equipe é análise fora do contexto | Alto |
| **🟡 P1** | Milestones são barras normais (sem marca especial) | Marcos não se destacam de atividades ordinárias | Baixo |
| **🟡 P1** | Sem alocação de equipe/recurso no Gantt (existe no DB, não aparece) | Planejador não vê "quem faz" no cronograma | Médio |
| **🟡 P1** | Sem realizado vs planejado no mesmo gráfico | Acompanhamento é pré-histórico (Etapa 8) | Alto |
| **🟡 P1** | Sem agrupamento por fase/responsável | Milhares de atividades se perdem na lista | Médio |
| **🟡 P1** | Sem indicadores de desvio (atividades que saíram de trilho) | Gestão reativa, não proativa | Médio |

---

## 2. ANÁLISE DETALHADA DAS MELHORIAS

### 🔴 **P0.1 — Calendário de Trabalho e Feriados**

**Problema:**  
O Gantt usa `startOffset` (dias corridos) sem considerar:
- Fins de semana (sábado/domingo)
- Feriados nacionais/estaduais/municipais
- Turnos especiais (obra 24h, segunda a sexta)
- Indisponibilidades de equipe

**Código atual:**
```typescript
const dateAt = (o: number) => (projectStart === null ? `+${o}d` : 
  new Date(projectStart + o * 86400000).toLocaleDateString("pt-BR"));
```

**Proposta:**

1. **Tabela `work_calendars`**:
   ```sql
   CREATE TABLE work_calendars (
     id INT PRIMARY KEY AUTO_INCREMENT,
     projectId INT NOT NULL,
     name VARCHAR(160),
     startDate TIMESTAMP,
     endDate TIMESTAMP,
     workingDayPattern ENUM('seg-sex', 'todos', 'customizado'), -- M-F, 7/7, ou específico
     exceptionDates JSON, -- {"2026-09-07": "feriado", "2026-10-12": "sem_aula"}
     FOREIGN KEY (projectId) REFERENCES projects(id)
   );
   ```

2. **Função de cálculo `workingDaysOnly(startDate, duration, calendar)`**:
   - Input: data início, duração em **dias úteis**, calendário
   - Output: data fim (pulando fins de semana e feriados)
   - Inverso: `workingDaysBetween(start, end, calendar)` = dias úteis reais

3. **Mudança no Gantt**:
   - Campo `durationDays` interpretado como **"dias úteis"** quando calendário está ativo
   - Renderizar o Gantt com coluna-hora corrigida (dias úteis em X, não lineares em pixels)
   - Header mostra datas reais (com feriados destacados em cinza)

4. **Impacto no DB**:
   ```typescript
   // Novo campo em schedule_activities
   calendarId: int(calendarId).references(() => workCalendars.id)
   
   // Campos antigos continuam (startOffset em dias corridos internamente)
   // Nova coluna para cache: realDurationWorkingDays
   ```

**Benefício:** Prazo 100% realista; integração com SINAPI (que usa dias úteis).

**Esforço:** 3–4 dias (DB + algoritmo + renderização)

---

### 🔴 **P0.2 — Comparação Visual Baseline vs Plano Atual**

**Problema:**  
Baselines existem no DB (`schedule_baselines`, `schedule_baseline_items`), mas:
- Não são renderizadas no Gantt
- Não há comparação de variação (atraso/adiantamento)
- Usuário não sabe se desviou do planejado

**Proposta:**

1. **UI: Seletor de Baseline no Header**:
   ```tsx
   <select onChange={(e) => setComparisonBaseline(parseInt(e.target.value))}>
     <option value="">Sem comparação</option>
     {baselines.map(b => <option value={b.id}>{b.name}</option>)}
   </select>
   ```

2. **Renderização de Comparação**:
   - **Cada atividade exibe 2 barras**:
     - Barra primária (plano atual, azul)
     - Barra secundária (baseline, cinza tracejado)
   - **Cores de desvio**:
     - Verde: antecipada (fim anterior ao baseline)
     - Amarelo: leve atraso (0–2 dias)
     - Vermelho: atraso crítico (>2 dias)
   - **Tooltip com variação**:
     ```
     Baseline: 10/10 a 15/10 (5d)
     Atual: 12/10 a 18/10 (6d) → +2d atraso
     ```

3. **Cálculo de Variação**:
   ```typescript
   const getVariation = (activity, baseline) => {
     const bItem = baseline.items.find(i => i.activityId === activity.id);
     if (!bItem) return { type: "nova", dias: null }; // atividade nova
     const deltaStart = (activity.startOffset ?? 0) - (bItem.startOffset ?? 0);
     const deltaDur = (activity.durationDays ?? 1) - (bItem.durationDays ?? 1);
     const deltaFinish = deltaStart + deltaDur;
     return { type: deltaFinish > 0 ? "atraso" : "adiantada", dias: Math.abs(deltaFinish) };
   };
   ```

4. **Tabela Resumo**:
   ```
   Resumo de Variação (Baseline: "Planejamento Original")
   Adiantadas: 5 | Atrasadas: 12 | Novas: 2 | Removidas: 1
   Atraso médio: +3,2 dias | Atraso máximo: +15 dias (Fundação)
   ```

**Benefício:** Visibilidade instantânea de desvios; decisões de correto rapidas.

**Esforço:** 2–3 dias (renderização dupla + API)

---

### 🔴 **P0.3 — Restrições Visuais (Bloqueios e Gatilhos)**

**Problema:**  
Existem MCPs e decisões que impõem restrições (ex: "fundação só começa com aprovação"), mas:
- Nenhuma é mostrada no Gantt
- Bloqueios são "dados fantasmas"
- Planejador não sabe por que atividade está travada

**Proposta:**

1. **Tabela `activity_constraints`**:
   ```sql
   CREATE TABLE activity_constraints (
     id INT PRIMARY KEY AUTO_INCREMENT,
     projectId INT NOT NULL,
     activityId INT NOT NULL,
     constraintType ENUM(
       'start_date', -- data não pode ser antes de X
       'approval_gate', -- requer aprovação de Y
       'predecessor_completion', -- predecessor deve estar >90%
       'resource_availability', -- recurso desocupado até X
       'site_access', -- frente não liberada até X
       'weather', -- trabalho só em seco
       'regulatory' -- licença/vistoria pendente
     ),
     targetValue VARCHAR(500), -- "2026-10-15", "engenheiro_responsavel_id", etc
     impactOnSchedule ENUM('bloqueia_total', 'atrasa_n_dias', 'estima_variação'),
     impactValue INT, -- ex: atrasa_n_dias = 5 dias
     status ENUM('ativa', 'satisfeita', 'vencida', 'removida'),
     owner VARCHAR(180), -- responsável por resolver
     createdAt TIMESTAMP,
     FOREIGN KEY (projectId, activityId) REFERENCES schedule_activities(projectId, id)
   );
   ```

2. **Visual no Gantt**:
   - **Ícone de cadeado** 🔒 sobre barras com restrição ativa
   - **Cor de fundo**:
     - Laranja: restrição ativa (bloqueia)
     - Amarelo: restrição próxima (saticfaz em 3 dias)
     - Verde: restrição satisfeita
   - **Tooltip ao passar mouse**:
     ```
     🔒 Bloqueio: Aprovação de projeto (Engenheiro > Rafaela Gomes)
     Estado: Pendente desde 2026-09-20
     Impacto: +5 dias de atraso potencial
     ```

3. **Integração com Painel**:
   - Seção "Hoje na obra" mostra restrições que vencem (hoje, esta semana)
   - Agent pode consultar: "Quais restrições ameaçam o caminho crítico?"

4. **API Endpoint**:
   ```typescript
   trpc.planning.getActivityConstraints.useQuery({ projectId, activityId? })
   // Retorna lista de restrições com status, dono, data limite
   ```

**Benefício:** Gestão proativa de risco; comunicação clara de bloqueios.

**Esforço:** 2–3 dias (DB + renderização + notificação)

---

### 🟡 **P1.1 — Slack e Folga Livre Visível**

**Problema:**  
O CPM calcula `totalFloat` (folga total), mas:
- Não é exibido no Gantt
- Planejador não vê margem de segurança
- Folga compartilhada não é indicada

**Proposta:**

1. **Coluna "Folga"**:
   - Adicionar à tabela de colunas customizáveis
   - Exibe `totalFloat` em dias
   - Código:
     ```tsx
     {cols.folga && <td style={{ padding: "0 5px", color: r.totalFloat > 5 ? "var(--ok)" : "var(--warn)" }}>
       {r.totalFloat ?? 0}d
     </td>}
     ```

2. **Rendição Visual no SVG**:
   - Desenhar "espaço em branco" após a barra (folga livre)
   - Cor: azul muito claro, semi-transparente
   - Tooltip: "Folga: 5 dias (pode atrasar até 2026-10-25 sem impacto)"

3. **Atividades de folga 0**:
   - Destaque em vermelho (caminho crítico compartilhado)
   - Aviso: "Esta atividade está crítica e compartilha folga"

4. **Cálculo de Folga Compartilhada**:
   ```typescript
   const folgaCompartilhada = (activityId) => {
     const deps = successors(activityId);
     if (deps.length === 0) return totalFloat;
     return Math.min(...deps.map(d => d.totalFloat ?? 0));
   };
   ```

**Benefício:** Planejador vê espaço de manobra; decisões de buffer informadas.

**Esforço:** 1–2 dias (UI simples)

---

### 🟡 **P1.2 — Linha de Balanço Integrada ao Gantt**

**Problema:**  
Linha de Balanço (LOB) existe em aba separada, mas:
- Não mostra no mesmo contexto que o Gantt
- Ritmo de equipe é análise desconectada
- Detecção de interferência é manual

**Proposta:**

1. **Aba Dual: "Gantt + Ritmo"**:
   - Painel esquerdo: Gantt filtrado por frente/equipe
   - Painel direito: Linha de Balanço da frente selecionada
   - Sincronização: clicar na atividade no Gantt destaca a linha LOB correspondente

2. **Gráfico LOB Sobreposto (Modo Avançado)**:
   - Checkbox: "Sobrepor Linha de Balanço"
   - LOB renderizada como área sombreada sob o Gantt
   - Eixo Y: unidades de progresso (pavimentos, metros, etc.)
   - Eixo X: tempo (mesma escala que Gantt)
   - Detecta visualmente:
     - Ritmo quebrado (degrau)
     - Interferência de equipe (cruzamento)
     - Espera (gap horizontal)

3. **Indicadores de Ritmo**:
   ```
   Ritmo Planejado: 2,5 pav/semana
   Ritmo Realizado: 1,8 pav/semana (tendência: atraso de 3,2 semanas)
   Espera acumulada: 4,5 semanas
   Recomendação: Aumentar equipe ou revisar sequência
   ```

4. **Integração com Agent**:
   - "Qual é o ritmo esperado desta frente?"
   - "Onde a equipe está esperando na Linha de Balanço?"
   - "Qual é a melhor sequência para manter o ritmo?"

**Benefício:** Planejamento operacional integrado; detecção de ineficiências.

**Esforço:** 4–5 dias (gráfico duplo + sincronização)

---

### 🟡 **P1.3 — Milestones (Marcos) Diferenciados**

**Problema:**  
Marcos (ex: "Fundação concluída", "Projeto aprovado") são atividades normais de 1 dia.  
Precisam de visual especial.

**Proposta:**

1. **Campo no DB**:
   ```typescript
   // Em schedule_activities
   isMilestone: boolean().default(false),
   milestoneType: mysqlEnum('tipo', ['goal', 'approval', 'delivery', 'review']),
   ```

2. **Visual no Gantt**:
   - Milestones são **diamantes** (◇), não retângulos
   - Cores por tipo:
     - Goal (meta): azul-escuro
     - Approval (aprovação): laranja
     - Delivery (entrega): verde
     - Review (revisão): roxo
   - Renderização:
     ```tsx
     if (r.isMilestone) {
       // Desenhar diamante em vez de retângulo
       const d = `M ${x} ${y-8} L ${x+6} ${y} L ${x} ${y+8} L ${x-6} ${y} Z`;
       return <path d={d} fill={color} />;
     }
     ```

3. **Sem duração editável**:
   - Milestones não têm resize (duração = 0)
   - Apenas posição pode ser movida (data alvo)

4. **Detalhes no Tooltip**:
   ```
   ◇ Projeto Aprovado (Milestone)
   Data: 2026-10-15
   Folga: 2 dias até próxima atividade
   Responsável: Arquiteto
   ```

**Benefício:** Marcos visíveis; diferenciação clara de objetivos vs atividades.

**Esforço:** 1–2 dias (DB + SVG)

---

### 🟡 **P1.4 — Alocação de Equipe/Recurso no Gantt**

**Problema:**  
Tabela `activity_resource_allocations` existe, mas:
- Gantt não mostra "quem faz"
- Planejador não vê conflito de equipe
- Balanceamento de carga é manual

**Proposta:**

1. **Coluna "Equipe" na Tabela**:
   ```tsx
   {cols.equipe && <td style={{ padding: "0 5px", fontSize: 9, color: "var(--text2)" }}>
     {r.teams.map(t => t.name).join(", ")}
   </td>}
   ```

2. **Badge na Barra do Gantt**:
   - Pequeno retângulo com iniciais da equipe
   - Posicionado no canto superior-esquerdo da barra
   - Cores por trade (Estrutura = verde, Acabamento = azul, etc.)
   - Ao clicar: abre dropdown para mudar alocação

3. **Heatmap de Carga de Equipe**:
   - Checkbox: "Mostrar carga de equipe"
   - Ao lado do Gantt: gráfico de carga por equipe/período
   - Eixo Y: equipes
   - Eixo X: semanas
   - Células coloridas: verde (normal), amarelo (120%), vermelho (>140%)

4. **Conflitos de Alocação**:
   - Aviso quando uma equipe está alocada >100% em um período
   - Sugestão: "Equipe Estrutura está 150% alocada na semana 43. Mover 'Pilares' para semana 44?"

5. **API**:
   ```typescript
   trpc.planning.getTeamLoad.useQuery({ projectId, startDate?, endDate? })
   // Retorna { teamId, team, weeks: [{ week, allocated%, activities }] }
   ```

**Benefício:** Detecção de sobrecarga; balanceamento de equipes.

**Esforço:** 3–4 dias (UI + cálculo de carga + alertas)

---

### 🟡 **P1.5 — Realizado vs Planejado Simultâneo**

**Problema:**  
Etapa 8 trará medições reais, mas integração ainda é futura.

**Proposta (Roadmap):**

1. **Segunda Barra para Realizado**:
   - Ao lado da barra planejada: barra cinzenta com realizado
   - Proporção: % de progresso da medição
   - Cores: verde (conforme planejado), amarelo (leve atraso), vermelho (atraso)

2. **Linha de Tendência**:
   - Linha vermelha tracejada mostrando trajetória de conclusão (se manter ritmo)
   - Se tocar a data de término planejada: sem aviso
   - Se ultrapassar: aviso + dias de atraso previsto

3. **Indicador de Nível de Confiança**:
   - Badge % no fim da linha: "97% confiança em prazo"
   - Baseado em variância histórica e ritmo

4. **Integração Futura (Etapa 8+)**:
   ```typescript
   type ProgressData = {
     activityId: number;
     measuredDate: Date;
     quantity: number;
     unit: string;
     progress%: number;
     trend: 'on_track' | 'ahead' | 'behind';
     forecastCompletion: Date;
   };
   ```

**Benefício:** Acompanhamento em tempo real; alertas de risco.

**Esforço:** Futuro (depende de Etapa 8)

---

### 🟡 **P1.6 — Agrupamento por Fase/Responsável**

**Problema:**  
Atividades estão em ordem de WBS/ID, mas cronogramas reais têm centenas/milhares.  
Planejador se perde na navegação.

**Proposta:**

1. **Grouping UI**:
   ```tsx
   <select onChange={(e) => setGroupBy(e.target.value)}>
     <option value="wbs">EAP</option>
     <option value="fase">Fase</option>
     <option value="responsavel">Responsável</option>
     <option value="criticalidade">Criticidade</option>
     <option value="status">Status</option>
   </select>
   ```

2. **Renderização em Árvore Colapsível**:
   ```
   📁 Fundação (8 atividades, 3 críticas)
      📌 Escavação (Não iniciado, Equipe A)
      📌 Forma (Não iniciado, Equipe A)
      📌 Concretagem (Não iniciado, Equipe B)
   📁 Estrutura (20 atividades, 15 críticas)
      📌 Pilares P1-P10 (Em andamento, 45%, Equipe B)
   ```

3. **Indicadores por Grupo**:
   - Total de atividades
   - Críticas / Não-críticas
   - Em andamento / Concluídas
   - Atraso (se houver)

4. **Filtro Rápido**:
   - Pesquisa de atividade dentro do grupo
   - Filter: "Mostrar apenas [Críticas] [Em risco] [Sem responsável]"

**Benefício:** Navegação intuitiva; relatórios por área.

**Esforço:** 2–3 dias (UI + sort)

---

### 🟡 **P1.7 — Indicadores de Desvio (Status Operacional)**

**Problema:**  
Nenhuma indicação visual de que atividade saiu de trilho.

**Proposta:**

1. **Status Estendido da Atividade**:
   ```typescript
   // Campo novo em schedule_activities
   operationalStatus: mysqlEnum('status', [
     'on_track', // no prazo
     'at_risk', // atraso de 1–5 dias previsto
     'delayed', // atraso confirmado >5 dias
     'blocked', // restrição ativa
     'early', // adiantada
     'completed', // finalizada
   ]).default('on_track'),
   ```

2. **Cores de Status**:
   - Verde: on_track
   - Amarelo: at_risk ou early
   - Vermelho: delayed
   - Cinza: completed ou blocked

3. **Ícones no Gantt**:
   - ✓ Verde: no prazo
   - ⚠️ Amarelo: em risco (atraso previsto)
   - ❌ Vermelho: atrasada
   - 🔒 Bloqueio ativo
   - 🎯 Adiantada

4. **Cálculo Automático**:
   ```typescript
   const calculateOperationalStatus = (activity, baseline, realizado) => {
     if (realizado && realizado.progress === 100) return 'completed';
     if (constraints && constraints.some(c => c.status === 'ativa')) return 'blocked';
     if (baseline) {
       const deltaFinish = (activity.earlyFinish ?? 0) - (baseline.earlyFinish ?? 0);
       if (deltaFinish > 5) return 'delayed';
       if (deltaFinish > 0) return 'at_risk';
       if (deltaFinish < -2) return 'early';
     }
     return 'on_track';
   };
   ```

5. **Filtro Rápido**:
   - Checkbox: "Mostrar apenas [Em risco] [Atrasadas] [Bloqueadas]"

**Benefício:** Gestão pelo exceção; alertas automáticos.

**Esforço:** 2–3 dias (lógica + UI)

---

## 3. ROADMAP DE IMPLEMENTAÇÃO (Prioritário)

### **Fase 1 — Fundação (Semanas 1–2)**

| Item | Esforço | Resultado |
|---|---|---|
| P0.2: Comparação Baseline | 3d | Desvios visíveis |
| P0.3: Restrições Visuais | 3d | Bloqueios comunicados |
| P1.7: Indicadores de Desvio | 2d | Gestão pelo exceção |

**Total:** 8 dias | **Entrada para:** Etapa 8 (Medição)

---

### **Fase 2 — Calendário e Recursos (Semanas 3–4)**

| Item | Esforço | Resultado |
|---|---|---|
| P0.1: Calendário de Trabalho | 4d | Prazos 100% realistas |
| P1.4: Alocação de Equipe | 4d | Visibilidade de carga |
| P1.6: Agrupamento | 3d | Navegação intuitiva |

**Total:** 11 dias | **Entrada para:** Balanceamento operacional

---

### **Fase 3 — Operacional (Semanas 5–6)**

| Item | Esforço | Resultado |
|---|---|---|
| P1.1: Slack/Folga | 2d | Margem de segurança visível |
| P1.3: Milestones | 2d | Marcos destacados |
| P1.2: LOB Integrada | 5d | Ritmo integrado |

**Total:** 9 dias | **Entrada para:** Análise operacional diária

---

## 4. IMPACTO NO BANCO DE DADOS

### Tabelas Novas

```sql
-- Calendário de trabalho
CREATE TABLE work_calendars (
  id INT PRIMARY KEY AUTO_INCREMENT,
  projectId INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  workingDayPattern ENUM('seg-sex', 'todos', 'customizado') DEFAULT 'seg-sex',
  startDate DATE,
  endDate DATE,
  exceptionDates JSON,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projectId) REFERENCES projects(id),
  UNIQUE KEY (projectId, name)
);

-- Restrições de atividade
CREATE TABLE activity_constraints (
  id INT PRIMARY KEY AUTO_INCREMENT,
  projectId INT NOT NULL,
  activityId INT NOT NULL,
  constraintType ENUM('start_date', 'approval_gate', 'predecessor_completion', 'resource_availability', 'site_access', 'weather', 'regulatory'),
  targetValue VARCHAR(500),
  impactOnSchedule ENUM('bloqueia_total', 'atrasa_n_dias'),
  impactValue INT,
  status ENUM('ativa', 'satisfeita', 'vencida', 'removida') DEFAULT 'ativa',
  owner VARCHAR(180),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projectId) REFERENCES projects(id),
  FOREIGN KEY (activityId) REFERENCES schedule_activities(id),
  INDEX (projectId, status)
);
```

### Colunas Novas em `schedule_activities`

```sql
ALTER TABLE schedule_activities
  ADD COLUMN calendarId INT REFERENCES work_calendars(id),
  ADD COLUMN isMilestone BOOLEAN DEFAULT FALSE,
  ADD COLUMN milestoneType ENUM('goal', 'approval', 'delivery', 'review'),
  ADD COLUMN operationalStatus ENUM('on_track', 'at_risk', 'delayed', 'blocked', 'early', 'completed') DEFAULT 'on_track',
  ADD COLUMN responsavel VARCHAR(180),
  ADD COLUMN forecastCompletion TIMESTAMP;
```

### Migrations Drizzle

```typescript
// drizzle/0018_calendars_constraints.sql
// Cria as tabelas e altera schedule_activities

// Versionamento:
// migration version 0018 depende de 0017 (schedule_baselines)
```

---

## 5. CHECKLIST DE IMPLEMENTAÇÃO

### P0.2 — Comparação Baseline

- [ ] UI: Seletor de baseline no header
- [ ] Renderizar barra dupla (atual + baseline)
- [ ] Cores de desvio (verde/amarelo/vermelho)
- [ ] Tooltip com cálculo de variação
- [ ] Tabela resumo de variação
- [ ] Testes unitários (cálculo de variação)
- [ ] E2E: exportar Gantt com comparação

### P0.3 — Restrições Visuais

- [ ] Criar tabela `activity_constraints`
- [ ] CRUD de restrições (API)
- [ ] Ícone 🔒 no Gantt
- [ ] Cores de status (ativa/satisfeita)
- [ ] Tooltip com detalhe de restrição
- [ ] Widget "Restrições Vencidas" no painel
- [ ] Integração com Agent
- [ ] Testes: bloquear atividade com restrição ativa

### P1.7 — Indicadores de Desvio

- [ ] Coluna `operationalStatus` em DB
- [ ] Lógica de cálculo (on_track/at_risk/delayed/blocked/early)
- [ ] Cores no Gantt
- [ ] Ícones visuais (✓/⚠️/❌/🔒)
- [ ] Filtro rápido por status
- [ ] Testes: variação de 5d → "at_risk"
- [ ] E2E: filtrar e exportar atrasadas

### P0.1 — Calendário de Trabalho

- [ ] Criar tabela `work_calendars`
- [ ] CRUD de calendários
- [ ] Função `workingDaysOnly(start, duration, calendar)`
- [ ] Inverso `workingDaysBetween(start, end, calendar)`
- [ ] Alterar renderização do header (marcar feriados)
- [ ] Alterar cálculo de `dateAt()` com calendário
- [ ] Dados teste: feriados 2026 (BR)
- [ ] Testes: 5d úteis = 7d corridos (M-F)

### P1.4 — Alocação de Equipe

- [ ] Coluna "Equipe" na tabela
- [ ] Badges de trade no Gantt
- [ ] Tabela de carga por período
- [ ] Heatmap de sobrecarga
- [ ] Alertas de conflito
- [ ] Endpoint `getTeamLoad()`
- [ ] Testes: sobrecarga >100%

### P1.6 — Agrupamento

- [ ] UI: Seletor de groupBy
- [ ] Renderização em árvore
- [ ] Collapse/expand de grupos
- [ ] Indicadores por grupo (total, críticas, status)
- [ ] Pesquisa dentro do grupo
- [ ] Filtros (críticas/risco/sem responsável)
- [ ] Testes: groupBy='fase'

### P1.1 — Slack/Folga

- [ ] Coluna "Folga" em table
- [ ] Renderizar espaço em branco após barra
- [ ] Tooltip com folga compartilhada
- [ ] Cores (>5d verde, ≤5d amarelo, 0 vermelho)
- [ ] Testes: folga 0 = crítica

### P1.3 — Milestones

- [ ] Colunas no DB (isMilestone, milestoneType)
- [ ] Renderizar diamante no SVG
- [ ] Cores por tipo
- [ ] Sem resize (duração fixa 0)
- [ ] Tooltip especial
- [ ] Testes: milestone não redimensionável

### P1.2 — LOB Integrada

- [ ] Sincronizar frente selecionada entre Gantt e LOB
- [ ] Aba dual: "Gantt + Ritmo"
- [ ] Overlay de LOB (modo avançado)
- [ ] Detectar interferência visualmente
- [ ] Indicadores de ritmo
- [ ] Integração com Agent
- [ ] Testes: click Gantt → destaca LOB

---

## 6. IMPACTO NA ARQUITETURA

### Backend (Routers tRPC)

```typescript
// server/routers.ts adiciona:

// Calendários
planning.getWorkCalendars.query({ projectId })
planning.createWorkCalendar.mutation({ projectId, name, pattern, exceptions })
planning.updateWorkCalendar.mutation({ calendarId, ... })

// Restrições
planning.getActivityConstraints.query({ projectId, activityId? })
planning.createConstraint.mutation({ projectId, activityId, type, target, impact })
planning.updateConstraintStatus.mutation({ constraintId, status })

// Cálculos
planning.calculateVariation.query({ projectId, baselineId })
planning.getTeamLoad.query({ projectId, startDate, endDate })
planning.getOperationalStatus.query({ projectId })
```

### Frontend (Componentes)

```typescript
// client/src/components/
// GanttView.tsx (extendido)
// GanttComparison.tsx (novo)
// ConstraintPanel.tsx (novo)
// TeamLoadHeatmap.tsx (novo)
// WorkCalendarEditor.tsx (novo)
```

### Integrações MCP

- **Agent**: Acesso a restrições, variações, operationalStatus
- **Sugestões automáticas**: "Restrição X vence em 2 dias"

---

## 7. CRITÉRIOS DE SUCESSO

Após implementação completa das 3 fases:

| Critério | Baseline | Meta |
|---|---|---|
| **Detecção de Desvio** | Manual | <5 min (comparação baseline visível) |
| **Comunicação de Bloqueios** | Nenhuma | 100% restrições visualizadas |
| **Realismo de Prazos** | 50% (sem calendário) | 95% (com calendário + medição) |
| **Tempo de Replanejamento** | 2–4 horas | <1 hora (com indicadores) |
| **Confiabilidade de LOB** | Análise separada | Integrada ao Gantt |
| **Detecção de Sobrecarga** | Manual (planilha) | Automática (heatmap) |

---

## 8. ROADMAP DE CÓDIGO (Commits)

```
Phase 1 (8d):
  ✅ feat: add baseline comparison to gantt
  ✅ feat: add activity constraints and visual indicators
  ✅ feat: add operational status calculation and filters

Phase 2 (11d):
  ✅ feat: add work calendar support and realistic date calculation
  ✅ feat: add team load heatmap and allocation visualization
  ✅ feat: add grouping and filtering ui to gantt

Phase 3 (9d):
  ✅ feat: add slack/float visualization
  ✅ feat: add milestone support and visual differentiation
  ✅ feat: integrate line of balance with gantt interactive view
```

---

## 9. REFERÊNCIAS E PRÓXIMOS PASSOS

- **Metodologia**: Aldo Dórea Mattos, "Planejamento e Controle de Obras"
- **Etapa 7**: `ETAPA-07-GANTT-BASELINE-LINHA-DE-BALANCO.md` (baseline já existe)
- **Etapa 8**: `ETAPA-08-MEDICAO-AVANCO-E-CONTROLE.md` (entrada para realizado vs planejado)
- **Plano Mestre**: `PLANO-MESTRE-PRODUCAO-MEDICAO.md` (fluxo diário)

### Próximas Ações

1. **Semana 1**: Priorizar P0.2, P0.3 e P1.7 (impacto máximo)
2. **Semana 2**: Iniciar P0.1 (calendário) em paralelo com Etapa 8
3. **Semana 3**: Completar Fase 1, revisar com usuários
4. **Semana 4–5**: Fase 2 (calendário + equipes + agrupamento)
5. **Semana 6+**: Fase 3 (LOB + milestones) + Etapa 8 (medição)

---

**Documento preparado para:** Equipe de Produto Obras  
**Status:** Pronto para Priorização  
**Data de Revisão:** 2026-10-28

