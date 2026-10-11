# Plano de Correção — Lacunas do Sistema Obras

Data: 2026-10-11 | Base: commit `3b1654b` (develop, live)
Autor: Hermes (lead) | Parceiro: AionUi Butler

Nada aqui foi executado ainda. Este documento é o plano; a execução vem depois,
fase por fase, com verificação em cada uma.

---

## Diagnóstico — o que está medido

| Lacuna | Medição real | Evidência |
|---|---|---|
| Calendário de trabalho | `work_calendars` 0 · `calendar_exceptions` 0 | consulta ao banco |
| Recursos de planejamento | `planning_resources` 0 · `activity_resource_allocations` 0 | consulta ao banco |
| Composições sem componentes | **248** de 4.436 | consulta ao banco |
| Documentos da obra | `project_documents` 0 | consulta ao banco |
| Migrações no boot | `__drizzle_migrations` 20 linhas / 10 distintas | consulta ao banco |
| Tipos de insumo SEINFRA | `price_items` prefixos: **I**=10.968 · **G**=852 · **R**=8 | consulta ao banco |

### Causa raiz das 248 composições — NÃO é o enum

O enum `composition_components_componentType` **já tem** `servico`. A causa real,
medida:

- `service_compositions`: 4.434 com prefixo **C** + 2 com prefixo **I**
- `price_items`: **zero** linhas com prefixo **C** (só I, G, R)
- `composition_components`: só `material` (14.673) e `mao_de_obra` (6.431)

`composition_components.priceItemId` é `NOT NULL` e referencia `price_items(id)`.
Como as composições `C...` **não existem em `price_items`**, não há FK possível
para apontar. As 248 sem componente são exatamente aquelas cujos componentes são
todas composições `C...`.

O importador (`scripts/importar-seinfra-catalogo.mts`) insere os serviços do
"Planos-de-Servicos" em `service_compositions`, mas **não** cria a linha
correspondente em `price_items`. Para um serviço ser componente de outro, ele
precisa existir nas duas pontas.

**Duas correções possíveis** (decidir antes de executar):
- **(a)** Criar `price_items` espelho para cada composição `C...` (com
  `itemType='servico'`) e depois inserir os componentes. Preserva o modelo atual
  (FK NOT NULL).
- **(b)** Tornar `priceItemId` nullable e apontar componentes de serviço para
  `compositionId` direto. Muda o schema e o `uniqueIndex`.

Recomendação: **(a)** — não muda contrato, não exige migração de coluna, e o
enum já suporta `servico`.

---

## Fase 1 — Calendário de trabalho  [fundação]

**Por que primeiro:** é pré-requisito de CPM, Gantt, Linha de Balanço e da
duração de atividade. Hoje o CPM usa premissa genérica (`defaultCalendar`).

**O que já existe (não precisa criar):**
- `shared/work-calendar.ts` — tipos, `defaultCalendar`, `isWorkingDay`, `addDays`
- `server/construction/calendario-obra.ts` — loader único, com fallback que
  **declara** a origem (`origem: "obra" | "padrao"`)
- Tabelas `work_calendars` (weekPattern jsonb) e `calendar_exceptions`

**O que falta:**
1. Procedures tRPC de escrita: criar/atualizar calendário, adicionar/remover
   exceção (hoje `grep -c workCalendars server/routers.ts` = **0**)
2. Semear o calendário da AURORA TESTE (5×2 + feriados CE 2026)
3. Aba de UI para ver/editar (hoje não existe)

**Ferramentas:** Supabase MCP (`execute_sql`), edição de `server/routers.ts`,
`shared/work-calendar.ts` já pronto.

**Verificação:** CPM da AURORA recalcula e as datas mudam onde há feriado;
`calendario-obra.ts` retorna `origem: "obra"`.

---

## Fase 2 — Recursos de planejamento  [nivelamento]

**Por que depois do calendário:** nivelamento precisa de calendário para saber
quantos dias úteis cabem.

**O que já existe:**
- Tabela `planning_resources` (10 colunas) e `activity_resource_allocations` (6)
- 5 procedures em `server/routers.ts` (linhas 3426, 3920, 4334, 4594, 4706+)

**O que falta:**
1. Seed de recursos reais na AURORA TESTE (equipes, equipamentos, materiais)
2. Alocação por atividade (`activity_resource_allocations`)
3. Lógica de nivelamento (verificar se `dimensionar_equipes_lob` do MCP Gantt
   cobre; senão, implementar local)
4. Aba de UI

**Verificação:** histograma de recursos; nenhuma atividade alocada acima da
capacidade diária.

---

## Fase 3 — Composições SEINFRA  [dados]

**Decisão pendente:** (a) espelho em `price_items` ou (b) nullable.

**Passos com (a):**
1. Identificar os códigos `C...` que são componentes de alguém (2.162 estimados)
2. Criar `price_items` espelho (`itemType='servico'`, `catalogId` do SEINFRA)
3. Inserir `composition_components` com `componentType='servico'`
4. Conferir: `service_compositions` sem componente deve ir de 248 → 0

**Ferramentas:** `scripts/importar-seinfra-catalogo.mts` (dry-run primeiro),
Supabase MCP para verificação.

**Cuidado:** os `.xls` estão em
`Desktop/Planejamento de obras/seinfra-028.1/` — usar `--execute` só depois do
dry-run limpo.

---

## Fase 4 — Documentos da obra

`project_documents` 0 · componente `DocumentosDaObra.tsx` existe mas sem uso.
Verificar se há router; se não, criar upload/listagem/remoção.

---

## Fase 5 — Higiene do histórico de migrações

`__drizzle_migrations` com 20 linhas / 10 distintas. Causa: o caminho
`isLegacy`/BASELINE em `scripts/migrate-pg.mjs:201-212` insere sem verificar
existência. Correção: guarda de idempotência + limpeza das 10 duplicatas
(tabela de controle, não toca dados de negócio).

---

## Divisão de trabalho com o Butler

O Butler (`slot_id 01a120a9-0e40-7052-81ef-d55ffb420897`, status idle) entra
nas fases que **não** exigem decisão de arquitetura:

| Fase | Responsável | Motivo |
|---|---|---|
| 1 Calendário | Hermes | schema + semântica de CPM |
| 2 Recursos | Hermes (núcleo) + Butler (seed) | decisão de nivelamento é de engenharia |
| 3 SEINFRA | **Butler** | trabalho em lote, mecânico, verificável |
| 4 Documentos | **Butler** | CRUD isolado |
| 5 Migrações | Hermes | toca o runner de deploy |

---

## Ordem de execução

1 → 2 → 3 → 4 → 5, com commit + teste + verificação em cada fase antes de
passar para a próxima. Nenhuma fase avança com a anterior vermelha.
