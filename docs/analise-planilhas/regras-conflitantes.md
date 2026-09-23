# Regras Conflitantes — Decisões Manuais Pendentes

> **8 decisões** bloqueiam schema, importadores e KPIs.  
> Nenhuma foi tomada. Nada foi implementado.  
> Marque `DECISÃO:` com a escolha quando aprovar.

---

## D1 — Data-base e contrato oficiais da obra (conflito C1)

**Contexto**: P1 e P3 descrevem a MESMA obra (Piemarta / Empresa B) com valores e datas diferentes.

| Opção | Descrição | Prós | Contras |
|-------|-----------|------|---------|
| **A** | Adotar P1 (18/08/2026, R$ 6.444.600) | Mais campos, sistema LOB | P3 inteiro divergiria |
| **B** | Adotar P3 (15/07/2026, R$ 18.450.000) | Padrão relatório executivo | P1 KPIs/saldo errados |
| **C** | São recortes/épocas diferentes → modelar **snapshots** por data-base | Fidelidade histórica | Complexidade maior |
| **D** | Dados de amostra não representam produção real → **tratar como fixtures** e definir valores do sistema à parte | Evita contaminação | Perde referência de cross-check |

**Pergunta**: Quais são a data-base e o valor de contrato **oficiais** (ou as datas de cada snapshot)?

**DECISÃO:** _preencher_

---

## D2 — Granularidade de medição (conflito C2)

**Contexto**: P1 = medição **por serviço/período**; P3 = medição **global** do contrato (MED-01, parcela, saldo).

| Opção | Descrição | Prós | Contras |
|-------|-----------|------|---------|
| **A** | Só global (padrão P3) | Simples, contrato BR comum | Perde detalhe por serviço |
| **B** | Só por serviço (padrão P1) | Rastreabilidade fina | Difícil fechar parcela do contrato |
| **C** | **Híbrido**: Medicao (global) 1─* MedicaoItem (serviço) | Cobre os dois | Schema maior; rateio/regra de fechamento |
| **D** | Global + rateio derivado (sem item persistido) | Meio-termo | Menos auditável |

**Pergunta**: Qual granularidade é **obrigatória** no produto?

**DECISÃO:** _preencher_

---

## D3 — Identidade de cronograma / EAP (conflitos C3, C5)

**Contexto**: três códigos (`EST-ATV2`, `01.01`, task name) e três EAPs (relacional, física, orçamento).

| Opção | Descrição |
|-------|-----------|
| **A** | UUID interno + `codigo_exibicao` múltiplo (ex.: aceitar `EST-ATV2` **e** `01.01` na import) |
| **B** | Unificar em um só padrão de código (escolher P1 **ou** P3) e migrar |
| **C** | WBS só P1; P3 vira Atividade sem EAP paralela; P2 orçamento **não** é WBS |

Recomendação técnica: **A + C** (IDs estáveis, WBS=P1, custo≠WBS).

**DECISÃO:** _preencher_

---

## D4 — Enum único de status de atividade e serviço (conflito C4)

**Conjuntos em conflito**:

| Origem | Valores |
|--------|---------|
| P1 dados | concluido, em_andamento, atrasado, planejado |
| P1 fórmula | + bloqueado, cancelado (MANUAL) |
| P1 serviço | Planejado, Liberado, Em execução, Concluído, Cancelado |
| P3 dados | Concluido, Em andamento, Nao iniciado |
| P3 dashboard | + Atrasado |

**Perguntas**:
1. Status de **atividade**: quais entram? (incluir Bloqueado/Cancelado/Liberado?)
2. Status de **serviço**: mesmos ou enum separado?
3. Casing canônico (snake_case vs title case)?

**DECISÃO atividade:** _preencher_  
**DECISÃO serviço:** _preencher_

---

## D5 — Escala padrão do Gantt (conflito C6)

| Opção | Descrição |
|-------|-----------|
| **A** | Só semanal (como produto hoje / P1) |
| **B** | Configurável dia \| semana \| mês (combina P1+P2+P3) |
| **C** | Duas views: operacional (semana/dia) + executivo (mês) |

**Recomendação**: **B ou C** (exclusivo P2-U1 só se B/C).

**DECISÃO:** _preencher_

---

## D6 — Pré-obra / EAP física de ciclo de vida (exclusivo P2-U2)

**Contexto**: só P2 cobre viabilidade, projeto, projeto legal… antes da execução.

| Opção | Descrição |
|-------|-----------|
| **A** | **Fora de escopo** — produto = execução da obra |
| **B** | **Dentro de escopo** — Fases/Atividades `antes_obra=true` |
| **C** | Read-only como catálogo de template de relatório |

**Pergunta**: a plataforma acompanha fases **pré-obra**?

**DECISÃO:** _preencher_

---

## D7 — Mapeamento categorias de custo P2 (1001…) × orçamento P1 (ORC-xxx)

| Opção | Descrição |
|-------|-----------|
| **A** | `CategoriaOrcamento` com FK opcional em OrcamentoItem; tabela de mapeamento manual |
| **B** | Substituir códigos ORC-xxx pelos 4 dígitos P2 |
| **C** | Grupos livres (tag) sem entidade forte |

**DECISÃO:** _preencher_

---

## D8 — Equipes: transitórias (P1 FRENTES) vs RECURSOS vs P2/P3

| Opção | Descrição |
|-------|-----------|
| **A** | Equipe = entidade permanente (como P3 Equipe A–D) |
| **B** | Só RECURSOS (mão de obra) — equipes são views/agrupamentos |
| **C** | Manter 2 camadas como P1 hoje (equipe transitória + recurso) com migração documentada |

**DECISÃO:** _preencher_

---

## Bloqueios encadeados (após decisão)

| Se decidir… | Desbloqueia… |
|-------------|--------------|
| D1 | schema Obra, KPIs financeiros, fixtures |
| D2 | schema Medicao(+Item), import P1+P3 |
| D3/D7 | import cronograma/EAP/custo |
| D4 | enums, UI status, migração dados |
| D5 | UI Gantt |
| D6 | escopo fases |
| D8 | schema equipes/recursos |

---

## Checklist de aprovação

- [ ] D1 data-base/contrato  
- [ ] D2 medição  
- [ ] D3 IDs/EAP  
- [ ] D4 status  
- [ ] D5 Gantt  
- [ ] D6 pré-obra  
- [ ] D7 categorias custo  
- [ ] D8 equipes  

**Após todos marcados** → `plano-implementacao.md` pode sair da fase 0.
