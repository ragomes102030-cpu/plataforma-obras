# Motor de CPM Nativo

> **Arquitetura do CPM (Critical Path Method) calculado localmente, sem dependência de MCP.**

---

## Visão Geral

O Motor de CPM Nativo calcula o Caminho Crítico de um projeto **inteiramente no backend**, sem depender do MCP `calcular_caminho_critico`. Ele usa o motor matemático puro em `shared/cpm.ts`, valida dependências, calcula datas cedo/tarde, folga total e persiste o resultado no banco de dados.

**Resultado na AURORA TESTE (projectId=7, OB-PUPOCN):**
- 53 atividades calculadas
- 19 atividades críticas
- 330 dias de duração total

**Commits de implementação:**
1. `30f0803` — `feat(cpm): add CPM persister service (server/construction/cpm-persister.ts)`
2. `94a1d7c` — `feat(cpm): add calculateCpmLocal router procedure (server/routers.ts)`
3. `9752993` — `test(cpm): add E2E tests for AURORA TESTE`

---

## Arquitetura de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                    API (tRPC)                                │
│  planning.calculateCpmLocal  ←  Mutation HTTP POST           │
│  planning.calculateCpm       ←  Mutation (com calendário)    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              server/routers.ts                               │
│  - Busca atividades e dependências no banco                  │
│  - Determina escopo (projectId + versionId)                  │
│  - Chama calculador determinístico                           │
│  - Persiste resultado via CpmPersister                       │
└──────┬───────────────────────────────────────┬──────────────┘
       │                                       │
┌──────▼──────────────┐          ┌─────────────▼──────────────┐
│ cpm-calculator.ts   │          │ cpm-persister.ts           │
│ (Validação + Calc)  │          │ (Persistência no banco)    │
│                     │          │                             │
│ - validateDependencies         │ - UPDATE schedule_activities│
│ - calculateCpm (shared)        │ - earlyStart/Finish         │
│ - Retorna ScheduleResult       │ - lateStart/Finish          │
│   ou ValidationIssue[]         │ - totalFloat, critical      │
└──────┬──────────────┘          │ - cpmCalculatedAt           │
       │                         └─────────────────────────────┘
┌──────▼──────────────────────────────────────────────────────┐
│                    shared/cpm.ts                             │
│              Motor CPM Puro (sem I/O)                        │
│                                                              │
│  - Ordenação topológica (Kahn)                              │
│  - Forward pass: Early Start / Early Finish                  │
│  - Backward pass: Late Start / Late Finish                   │
│  - Total Float = LateStart - EarlyStart                      │
│  - Critical: totalFloat <= 0                                 │
│  - Tipos: FS, SS, FF, SF com lag                             │
└──────────────────────────────────────────────────────────────┘
```

---

## Componentes Detalhados

### 1. `shared/cpm.ts` — Motor CPM Puro

**Arquivo:** `shared/cpm.ts` (161 linhas)

Função principal:

```typescript
export function calculateCpm(
  activities: CpmActivity[],
  dependencies: Dependency[]
): ScheduleResult
```

**Características:**
- **Sem I/O**: não consulta relógio, banco ou rede
- **Determinístico**: a mesma entrada produz a mesma saída
- **Validações:**
  - IDs duplicados de atividades
  - Duração inválida (não-inteira ou negativa)
  - Dependências apontando para atividades inexistentes
  - Auto-ciclo (predecessor === sucessor)
  - Lag não-inteiro
  - Ciclos na rede (detectado via ordenação topológica de Kahn)

**Algoritmo:**
1. **Ordenação topológica** (Kahn) — garante ordem de processamento
2. **Forward pass** — calcula Early Start (ES) e Early Finish (EF) de cada atividade
3. **Backward pass** — calcula Late Start (LS) e Late Finish (LF) de cada atividade
4. **Folga** — Total Float = LS - ES; atividades com folga ≤ 0 são críticas

**Tipos de dependência:**

| Tipo | Significado | Cálculo ES |
|------|-------------|------------|
| `FS` | Finish-to-Start | `predecessor.finish + lag` |
| `SS` | Start-to-Start | `predecessor.start + lag` |
| `FF` | Finish-to-Finish | `predecessor.finish + lag - duration` |
| `SF` | Start-to-Finish | `predecessor.start + lag - duration` |

**Retorno:**

```typescript
type ScheduleResult = {
  activities: CpmResult[];  // Todas com ES, EF, LS, LF, folga, flag crítico
  projectDuration: number;   // Duração total em dias
  criticalPath: string[];    // IDs das atividades críticas (ordenadas)
};
```

---

### 2. `server/construction/cpm-calculator.ts` — Calculador com Validação

**Arquivo:** `server/construction/cpm-calculator.ts` (51 linhas)

Função principal:

```typescript
export function calculateDeterministicCpm(
  activities: ScheduleEvidenceActivity[],
  dependencies: ScheduleEvidenceDependency[]
): DeterministicCpmResult
```

**Responsabilidades:**
- Chama `validateDependencies()` para validação estrutural
- Converte tipos do banco (`ScheduleEvidenceActivity`) para tipos do motor (`CpmActivity`)
- Captura erros do motor e converte em `ValidationIssue[]`
- Retorna `{ valid: true, schedule }` ou `{ valid: false, issues }`

**Diferença do motor puro:** adiciona camada de validação e tradução de tipos, mantendo o cálculo isolado e testável.

---

### 3. `server/construction/cpm-persister.ts` — Persistência no Banco

**Arquivo:** `server/construction/cpm-persister.ts` (70 linhas)

Função principal:

```typescript
export async function persistCpmResult(
  db: NodePgDatabase<typeof schema>,
  projectId: number,
  versionId: number | null,
  result: ScheduleResult
): Promise<number>
```

**Responsabilidades:**
- Atualiza cada atividade individualmente via SQL direto (Drizzle não tem UPDATE em lote nativo)
- Campos atualizados:
  - `earlyStart`, `earlyFinish`, `lateStart`, `lateFinish`
  - `totalFloat`, `freeFloat`
  - `critical` (boolean → 0/1)
  - `cpmCalculatedAt` → `now()`
- Escopo: filtra por `projectId` e opcionalmente `versionId`
- Retorna o número de atividades atualizadas

---

### 4. `server/routers.ts` — Router tRPC (procedures)

#### `planning.calculateCpmLocal` (mutation)

**Input:** `{ projectId: number }`

**Fluxo:**
1. Verifica autenticação (`assertAccessibleProject`)
2. Busca versão atual do projeto
3. Busca atividades e dependências do escopo
4. Chama `calculateDeterministicCpm()`
5. Se válido, persiste via `persistCpmResult()`
6. Retorna `{ valid, schedule, issues, persisted }`

#### `planning.calculateCpm` (mutation, existente)

**Diferença:** Além do CPM, aplica restrições de calendário (`mustStartOn`, `finishNoLaterThan`) e retorna informações de restrições declaradas vs aplicadas. Usa transação (`db.transaction`) para persistência.

---

### 5. `server/agent/core/engineering-capabilities.ts` — Wrapper para Agentes

Função:

```typescript
export function calculateCpmLocally(
  activities: ScheduleEvidenceActivity[],
  dependencies: ScheduleEvidenceDependency[]
): DeterministicCpmResult
```

Simplesmente delega para `calculateDeterministicCpm`. Usada pelo orquestrador de agentes.

---

## Fluxo de Dados

```
Usuário → POST /api/trpc/planning.calculateCpmLocal
              │
              ▼
     ┌─── routers.ts ───┐
     │  Auth check      │
     │  Busca versão    │
     │  Busca atividades│ ←── schedule_activities (banco)
     │  Busca dependênc.│ ←── schedule_dependencies (banco)
     └───────┬──────────┘
             │
             ▼
     ┌─── cpm-calculator.ts ───┐
     │  validateDependencies()  │
     │  Tradução de tipos       │
     │  calculateCpm()         │ ←── shared/cpm.ts
     └───────┬─────────────────┘
             │
             ▼
     ┌─── cpm-persister.ts ───┐
     │  UPDATE schedule_activities
     │  SET earlyStart, earlyFinish,
     │     lateStart, lateFinish,
     │     totalFloat, critical,
     │     cpmCalculatedAt
     └───────┬─────────────────┘
             │
             ▼
     Retorna { valid, schedule, persisted }
```

---

## Como Usar

### Via API (tRPC)

```bash
curl -X POST /api/trpc/planning.calculateCpmLocal \
  -H "Content-Type: application/json" \
  -d '{"projectId": 7}'
```

**Resposta de sucesso:**

```json
{
  "valid": true,
  "persisted": 53,
  "schedule": {
    "activities": [...],
    "projectDuration": 330,
    "criticalPath": ["id1", "id2", "..."]
  },
  "issues": []
}
```

### Via código TypeScript

```typescript
import { calculateDeterministicCpm } from "./server/construction/cpm-calculator";

const result = calculateDeterministicCpm(activities, dependencies);

if (result.valid && result.schedule) {
  console.log("Duração:", result.schedule.projectDuration);
  console.log("Críticas:", result.schedule.criticalPath.length);
} else {
  console.error("Problemas:", result.issues);
}
```

---

## Decisões de Design

| Decisão | Motivo |
|---------|--------|
| Motor puro em `shared/cpm.ts` | Reutilizável, testável, sem side-effects |
| `calculateCpmLocal` separado do `calculateCpm` | `calculateCpm` tem lógica de calendário; `calculateCpmLocal` é CPM puro |
| Persistência individual (sem lote) | Drizzle ORM não suporta UPDATE em lote nativo |
| `freeFloat` incluído no persister | Campo existe no schema; motor pode calcular depois |
| Rede fragmentada não é erro | CPM calcula normalmente; atividades sem dependência ficam com ES=0 |
| `calculateCpm` (antigo) mantido | Compatibilidade com frontend que já usa restrições de calendário |

---

## Testes

### Testes unitários

- `server/construction/cpm-calculator.test.ts` — Validação e cálculo
- `server/routers.test.ts` — Verifica procedure existe
- `server/agent/core/engineering-capabilities.test.ts` — Wrapper do agente

### Testes E2E

- `tests/aurora-cpm.e2e.spec.ts` — Valida CPM na AURORA TESTE (projectId=7)

**Verificações E2E:**
1. `/healthz` responde com commit e branch corretos
2. AURORA TESTE tem atividades com `versionId` preenchido
3. Procedure `planning.calculateCpmLocal` está disponível
4. CPM é calculado e persistido corretamente

---

## Limitações

1. **Duração em dias inteiros** — o motor não suporta horas ou frações de dia
2. **Sem restrições de calendário no `calculateCpmLocal`** — feriados e fins de semana não são considerados; use `calculateCpm` para isso
3. **Rede fragmentada não é erro** — atividades sem conexão são calculadas com ES=0, mas não há alerta de rede desconectada
4. **Persistência N+1** — cada atividade é atualizada individualmente; para projetos muito grandes (1000+ atividades) pode ser lento
5. **Sem concorrência** — duas chamadas simultâneas para o mesmo projeto podem gerar inconsistência temporária (não há lock)
6. **`freeFloat` não calculado pelo motor** — o campo existe no schema e é persistido, mas `shared/cpm.ts` não calcula folga livre (apenas folga total)
7. **Sem remoção de atividades** — se uma atividade é removida do banco, os campos CPM antigos permanecem até recálculo
8. **Não usa MCP `calcular_caminho_critico`** — o CPM local substitui completamente o MCP para cálculo

---

## Referências

- Plano de implementação: `docs/superpowers/plans/2026-10-09-cpm-nativo.md`
- Commit 1: `30f0803` — persister
- Commit 2: `94a1d7c` — router
- Commit 3: `9752993` — testes E2E
