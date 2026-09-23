# Matriz de Conflitos — 3 Planilhas de Referência

> Conflitos identificados na auditoria independente de P1, P2, P3.  
> **Todos exigem decisão humana antes de implementação.**  
> Relacionado: `regras-conflitantes.md` (perguntas de decisão) · `MATRIZ_COMPARATIVA_3_PLANILHAS.md` §4 (resumo).

---

## C1 — Data-base da obra (P1 × P3)

| Planilha | Data-base | Contrato |
|----------|-----------|----------|
| P1 ARES | **18/08/2026** | R$ 6.444.600 (saldo R$ 3.462.300) |
| P3 Profissional | **15/07/2026** | R$ 18.450.000 (medido R$ 7.933.500) |
| P2 Template | 17/09/2026 (template) | n/a |

- **Mesma obra-amostra** (Piemarta / Empresa B), **valores e datas divergem**.
- **Tipo**: CONFLITANTE — impossível manter as duas como verdade sem reconciliação.
- **Hipóteses**: (a) recortes de épocas diferentes; (b) escopo/contrato revisado; (c) uma é desatualizada.
- **Ação**: definir data-base e contrato oficiais; arquivar a outra como snapshot.

---

## C2 — Granularidade de medição (P1 × P3)

| Aspecto | P1 MEDIÇÃO | P3 MEDICOES |
|---------|------------|-------------|
| Unidade | **Por serviço + período** | **Global do contrato (MED-01…06)** |
| Colunas chave | SERVIÇO, CONTRATADO, EXECUTADO, MEDIDO, %MED, valor/acum/saldo/status | N, Data, %Acum, Valor Acum, Parcela, Saldo, Status |
| Status | `aprovada` (p/ linhas) | Aprovada / Em analise |
| Erros | 23 errorCells | 0 |

- **Tipo**: CONFLITANTE — modelos opostos do mesmo conceito "medição".
- **Decisão**: modelo **híbrido** recomendado (global + detalhe por serviço), ou escolher um.
- **Bloqueia**: schema de `Medicao` / `MedicaoItem`.

---

## C3 — Código / identificador de cronograma (3×)

| Planilha | Formato | Exemplo |
|----------|---------|---------|
| P1 PLANEJAMENTO | prefixo legado + ATV | `EST-ATV2`, `LOC-ATV` |
| P3 CRONOGRAMA | hierárquico decimal | `01.01`, `03.02` |
| P2 Gantt | nome livre de task | texto |

- **Tipo**: DUPLICADO + CONFLITANTE — sem tabela de equivalência.
- **Ação**: escolher esquema de ID estável (UUID interno) + código de exibição configurável; mapear P3 `01.01` na importação.

---

## C4 — Vocabulário de status (P1 × P3 × listas)

| Origem | Valores |
|--------|---------|
| P1 dados PLANEJAMENTO | concluido, em_andamento, atrasado, planejado |
| P1 CONFIG status planejamento | NÃO INICIADO, EM ANDAMENTO, CONCLUÍDO, ATRASADO |
| P1 fórmula col Q | + BLOQUEADO, CANCELADO → **MANUAL** |
| P1 LISTA_STATUS_SERVICO | Planejado, Liberado, Em execução, Concluído, Cancelado |
| P3 CRONOGRAMA (dados) | Concluido, Em andamento, Nao iniciado (**sem Atrasado**) |
| P3 DASHBOARD | Concluído, Em andamento, Atrasado, Não iniciado |
| P2 | nenhum (só % progresso) |

- **Tipo**: CONFLITANTE (conjuntos e casing diferentes).
- **Ação**: enum único canônico + migração de valores legados; decidir se "Liberado" e "Bloqueado" entram no produto.

---

## C5 — Estrutura de EAP / WBS (3×)

| Planilha | Modelo |
|----------|--------|
| P1 | `EAP-001…085` + TIPO (DISCIPLINA/PACOTE/TRABALHO) + pai + nível — **WBS relacional** |
| P2 EAP Física | Referência decimal `1`, `1.1` + descrição — **checklist ciclo de vida** (viabilidade→entrega) |
| P2 EAP Orçamento | `1`, `1001`, `2001`… — **categoria de custo**, não WBS de escopo |
| P3 | **Não tem EAP** — atividades no CRONOGRAMA com código `01.01` |

- **Tipo**: DUPLICADO + CONFLITANTE (3 modelos paralelos).
- **Risco**: tratar EAP orçamentária P2 como se fosse WBS = erro de domínio.
- **Ação**: WBS = P1; categorias P2 → entidade `CategoriaOrcamento` separada; P2 física → opcional (fase pré-obra, ver U2); P3 → importar como Atividade.

---

## C6 — Escala do Gantt (3×)

| Planilha | Escala | Janela |
|----------|--------|--------|
| P1 | **Semanal** | data-base fixa 18/08/2026, barras por status |
| P2 | **Diário** | 8 semanas roláveis, hoje `#AD3815` |
| P3 | **Mensal** | 01/26→06/27 (18 meses) |

- **Tipo**: DUPLICADO (mesma função, UX diferente) — não é erro, é **feature de configuração**.
- **Ação**: Gantt com escala configurável (dia/semana/mês); P2 = ref. UX diária, P1 = operacional, P3 = executivo.

---

## C7 — Métricas / leitura de indicadores (interno P1 + P1×P3)

### C7a — Interno P1 (INDICADORES)
| Indicador | VALOR | Narrativa |
|-----------|-------|-----------|
| PRODUÇÃO | 0% | "72,5% do planejado" |
| MEDIÇÃO | 0% (valor) | 46,3% (texto) |

- **Tipo**: CONFLITANTE **interno** — narrativa ≠ valor.
- **Ação**: não portar KPI sem revalidar fórmula/origem.

### C7b — P1 × P3
- P1: produção 0% vs planejado ~40% (data-base 18/08)
- P3: real 38,93% vs planejado 40,95% (data-base 15/07)
- **Tipo**: parcialmente explicado por C1 (datas diferentes) + modelos de produção diferentes.

---

## C8 — Unidades de medida (P1 × P3)

| P1 LISTA_UNIDADES | P3 dados |
|-------------------|----------|
| m², m³, m, ml, un, vb, pt, kg, t, h | m2, m3, m, vb |

- **Tipo**: CONFLITANTE (string) — `m²`≠`m2`.
- **Ação**: lista canônica P1 + normalizador na importação (alias map).

---

## C9 — Integridade de fórmulas / erros

| Arquivo | Problema | Qtd |
|---------|----------|-----|
| P1 ORÇAMENTO | errorCells / `#OCLI_NOTEVAL!` | 11 |
| P1 MEDIÇÃO | `#DIV/0!`, `#VALUE!`, `#OCLI_NOTEVAL!` | 23 |
| P2 Gantt | `#REF!` | >0 |
| P1 INDICADORES | valor vs narrativa | 2+ |

- **Tipo**: OBSOLETO / não confiável em cache CLI.
- **Ação**: recalcular em Excel/LibreOffice **antes** de extrair valores de referência; não tratar leitura CLI como ground truth de resultados.

---

## C10 — BDI (P1 interno)

- Componentes documentados (TCU), fórmula presente, **BDI_TOTAL = 0 (PENDENTE)**.
- **Tipo**: PENDENTE DE DEFINIÇÃO (não é conflito entre planilhas — falta fonte oficial).
- **Ação**: obter % oficiais com fonte; não defaultar para 0 em produção.

---

## Matriz-resumo

| ID | Domínio | P1 | P2 | P3 | Tipo | Bloqueia |
|----|---------|----|----|----|------|----------|
| C1 | data-base/contrato | 18/08, 6,4M | 17/09 tmpl | 15/07, 18,4M | CONFLITANTE | import, KPIs |
| C2 | medição | por serviço | — | global | CONFLITANTE | schema Medicao |
| C3 | ID cronograma | EST-ATV2 | task name | 01.01 | DUPLICADO+CONFLITO | FKs, integração |
| C4 | status | 4–6 enums | — | 3–4 enums | CONFLITANTE | enum, migração |
| C5 | EAP | relacional | física+orçamento | ausente | DUPLICADO+CONFLITO | schema WBS |
| C6 | escala Gantt | semanal | diária | mensal | DUPLICADO (ok) | UI config |
| C7 | indicadores | narrativa≠valor | — | outras contas | CONFLITANTE interno | portar KPI |
| C8 | unidades | m², m³… | — | m2, m3 | CONFLITANTE string | import |
| C9 | erros fórmula | 34 cells | #REF! | 0 | OBSOLETO/cache | validação |
| C10 | BDI | 0% pendente | — | — | PENDENTE | orçamento com BDI |

---

## Próximo passo
Resolver `regras-conflitantes.md` (8 decisões) → então `plano-implementacao.md` pode ser executado.
