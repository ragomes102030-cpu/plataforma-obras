# Modelo de Domínio Consolidado (Proposta)

> Consolidação das 3 planilhas em entidades canônicas.  
> **Status**: proposta — não implementada.  
> Pré-requisito: decidir `regras-conflitantes.md` (especialmente C1, C2, C4, C5).

---

## 1. Princípios

1. **Fonte de verdade por entidade** — cada entidade tem planilha primária (matriz §5).
2. **IDs internos estáveis** (UUID/slug) + **código de exibição** separado (resolve C3).
3. **Enums centralizados** — um vocabulário por domínio (resolve C4).
4. **Derivados calculados, não digitados** (regra P1).
5. **Medição: modelo híbrido** global + detalhe (resolve C2 — sujeito à confirmação).
6. **Categorias de custo ≠ WBS** (resolve C5).

---

## 2. Diagrama entidades (texto)

```
Obra 1──* Local (árvore)
Obra 1──* Eap (WBS: DISCIPLINA|PACOTE|TRABALHO, pai, ordem)
Obra 1──* Frente (TIPO, STATUS)
Obra 1──* Recurso (TIPO, CUSTO_UNIT, CAPACIDADE)
Obra 1──* Atividade (cronograma)
Obra 1──* Medicao (global, N, datas, valores)
Obra 1──* Indicador / snapshot KPI

Local *──* Servico          via LOCAL_ID
Eap    *──* Servico          via EAP_ID
Frente *──* Servico          via FRENTE_ID
Servico 1──* Producao        (data, QTD_PREV, QTD_PROD, EQUIPE, META…)
Servico 1──* MedicaoItem     (se híbrido) → FK Medicao

Atividade *──* Precedencia   (pred, succ, TIPO=FS, lag)
Atividade ←— Producao        (agregação SUMIF p/ %Real)  [P3]
           ←— campos próprios %PLAN/%REAL               [P1]

OrcamentoItem (ORC-*) ──→ Servico
OrcamentoItem ──* Composicao ──→ Recurso
CategoriaOrcamento (P2: 1001/2001/…) ── agrupa OrcamentoItem / grupo

Equipe (transitória P1) ──→ aposentar; usar Recurso MO + vinculo Equipe×Recurso
```

---

## 3. Entidades detalhadas

### 3.1 Obra
| Campo | Tipo | Origem | Notas |
|-------|------|--------|-------|
| id | UUID | sistema | |
| codigo | string | P1 `OBRA-001` | exibição |
| nome | string | P1/P3 | Piemarta |
| cliente | string | P1 | |
| empreiteiro | string | P1/P3 | Empresa B |
| endereco | string | P3 RESUMO | |
| data_inicio | date | P1/P3 | 05/01/2026 |
| data_fim_prevista | date | P1/P3 | 30/06/2027 |
| data_base | date | **C1 decisão** | 18/08 vs 15/07 |
| valor_contrato | money | **C1 decisão** | 6,4M vs 18,4M |
| status | enum | P1 | Ativo… |

### 3.2 Local (árvore) — fonte P1
| Campo | Tipo | Origem |
|-------|------|--------|
| id | string | `LOCAL-T2-P10-AP03` |
| obra_id | FK | |
| tipo | enum | TORRE, PAVIMENTO, APARTAMENTO, AREA_COMUM… |
| descricao | string | |
| pai_id | FK Local | hierarquia |
| ordem | int | |

### 3.3 Eap (WBS) — fonte P1
| Campo | Tipo | Origem |
|-------|------|--------|
| id | string | `EAP-001` |
| obra_id | FK | |
| codigo_exibicao | string | `15.1` |
| descricao | string | |
| tipo | enum | DISCIPLINA \| PACOTE \| TRABALHO |
| pai_id | FK Eap | |
| nivel | int | |
| peso | decimal | |
| qtd_servicos | int | COUNTIFS (derivado) |

### 3.4 Frente — fonte P1 (+ labels P3)
| Campo | Tipo | Origem |
|-------|------|--------|
| id | string | `FRENTE-001` |
| obra_id | FK | |
| nome | string | |
| tipo | enum | EXECUÇÃO \| ACABAMENTO \| INSTALAÇÃO |
| status | enum | Ativa \| Inativa \| Descontinuada |
| qtd_servicos | int | derivado |

### 3.5 Servico — fonte P1 (entidade núcleo)
| Campo | Tipo | Origem | Regra |
|-------|------|--------|-------|
| id | string | `SERVICO-001` | |
| obra_id | FK | | |
| eap_id | FK | triângulo | EAP×FRENTE×LOCAL |
| frente_id | FK | triângulo | duplicata sinaliza |
| local_id | FK | triângulo | |
| descricao | string | | |
| unidade | enum | LISTA_UNIDADES | normalizar (C8) |
| qtd_contratada | decimal | | base contratual |
| preco_unitario | money | | derivado c/ BDI se aplicável |
| valor_contratado | money | **derivado** | qtd × preço |
| status | enum | LISTA_STATUS_SERVICO | |

### 3.6 Recurso / Composição — fonte P1
| Campo | Tipo |
|-------|------|
| Recurso: id, tipo (MO\|EQUIP\|MAT), nome, unidade, custo_unit, capacidade_dia |
| Composicao: recurso_id, orcamento_item_id ou servico_id, coeficiente |
| Vínculo Equipe×Recurso: transição — ver decisão §7 regras |

### 3.7 OrcamentoItem — fonte P1 (+ Categoria P2)
| Campo | Tipo | Origem |
|-------|------|--------|
| id | string | `ORC-001` |
| tipo_item | enum | SERVIÇO \| ESPECIAL |
| servico_id | FK? | |
| qtd, preco_unit, valor_orcado | | **derivado** |
| categoria_orcamento_id | FK? | mapear P2 `1001`… (C5) |
| bdi_aplicado | % | CONFIG BDI_TOTAL (**C10 pendente**) |

**CategoriaOrcamento** (novo, de P2): codigo_4dig, descricao, grupo_pai.

### 3.8 Atividade (cronograma) — fonte P1 PLANEJAMENTO + campos P3
| Campo | Tipo | Origem |
|-------|------|--------|
| id | interno | resolve C3 |
| codigo_exibicao | string | `EST-ATV2` ou `01.01` configurável |
| obra_id | FK | |
| descricao | string | |
| tipo | enum | P1 tipos de atividade |
| frente_id | FK? | P1/P3 |
| pavimento_label | string? | P3 (ou derivar de Local) |
| inicio, fim | date | |
| duracao_dias | int | **derivado** `fim−inicio+1` (P3) |
| quantidade | decimal | |
| produtividade | decimal | **derivado** `qtd/duracao` (P3) |
| pct_planejado | % | fórmula curva |
| pct_real | % | produção / outro |
| status | enum | **C4 decisão** |
| manual_override | bool | BLOQUEADO/CANCELADO (P1) |

### 3.9 Precedencia — fonte P1 REDE
| Campo | Tipo |
|-------|------|
| atividade_pred_id, atividade_succ_id | FK |
| tipo | FS (default) |
| lag_dias | int |
| origem_regra | R1 / R1-SUBST / R6… (auditoria) |

→ Alimenta **Caminho Crítico** (stub P1 → backlog).

### 3.10 Producao — fonte P1 (+ fluxo P3)
| Campo | Tipo | Origem |
|-------|------|--------|
| id | UUID | |
| data | date | P1/P3 |
| servico_id \| atividade_id | FK | P1=Serviço; P3=Atividade — **alinhar na import** |
| frente_id, equipe_id, local_id | FK? | P1 completo; P3 só equipe |
| qtd_prevista, qtd_produzida | decimal | P1; P3 só produzida |
| unidade | enum | |
| meta_dia | decimal | P1 |
| acumulado | decimal | derivado |
| observacao | text | P3 |

### 3.11 Medicao — **híbrido** (C2)
**Nível global (P3):**
| Campo | Tipo | Fórmula |
|-------|------|---------|
| id, obra_id, numero (MED-01), n, data | | |
| valor_acumulado | money | soma |
| parcela | money | acum − anterior |
| pct_acumulado | % | acum ÷ contrato |
| saldo_medir | money | contrato − acum |
| status | enum | Aprovada \| Em analise |

**Nível item (P1) — se híbrido confirmado:**
| Campo | Tipo |
|-------|------|
| medicao_id FK, servico_id FK | |
| qtd_contratada, qtd_executada, qtd_medida | |
| preco, valor_medido, valor_acum, saldo, pct_med | derivados |
| status | aprovada… |

### 3.12 Indicador / Dashboard
- Snapshot periódico: nome, valor, referencia, status_leitura, narrativa, data_base.
- Portar P1 INDICADORES **somente após C7** (revalidar contas).
- P3 DASHBOARD: KPIs financeiros + contagem status → views de leitura.

### 3.13 LinhaBalanco — fonte P1
- Grade atividade/serviço × período; KPIs topo; HOJE=TODAY().
- Entidade derivada (regenerável) ou materializada por obra+data_base.

### 3.14 Unidade e Enums (CONFIGURAÇÕES)
- `Unidade`: codigo_canonico (`m2`,`m3`,`m`,`ml`,`un`,`vb`,`pt`,`kg`,`t`,`h`) + alias (`m²`→`m2`).
- Enums centralizados: TipoEap, TipoFrente, StatusServico, StatusAtividade (C4), TipoRecurso, TipoItem, StatusMedicao…

### 3.15 Fases pré-obra (opcional — P2 U2)
- Se escopo incluir viabilidade/projeto/legal: `Fase` + `AtividadeFase` ou flag `antes_obra` na Atividade.
- Fora do MVP LOB se produto for só execução — **decisão**.

---

## 4. Regras de integridade (herdadas de P1)

1. EAP×FRENTE×LOCAL única por serviço (sinalizar duplicata).
2. Nenhum campo derivado editável (VALOR_*, CUSTO_DIRETO, PRECO c/ BDI).
3. ORÇADO ≠ CONTRATADO ≠ PRODUZIDO ≠ MEDIDO (validação de UI/BI).
4. QTD_PLANEJADA ≠ QTD_PRODUZIDA ≠ QTD_MEDIDA (colunas separadas).
5. Status manual (BLOQUEADO/CANCELADO) não recalculado por fórmula.
6. Unidades só do enum (com alias de import).
7. BDI nunca 0 silencioso — bloquear cálculo se fonte ausente (C10).

---

## 5. Mapeamento P2 → modelo

| P2 | Modelo consolidado |
|----|-------------------|
| EAP Física `1.1` | Atividade/Fase pré-obra (se aceito) ou catálogo read-only |
| EAP Orçamento `1001` | `CategoriaOrcamento` |
| Task Gantt + % progress | Atividade + (ideal) Producao % |
| ATRIBUÍDO PARA | `Pessoa` / responsavel_id na tarefa |
| UX 8 semanas diária | config UI Gantt |

---

## 6. Mapeamento P3 → modelo

| P3 | Modelo |
|----|--------|
| CRONOGRAMA linha | Atividade (`codigo_exibicao=01.01`) |
| Duração, Produtividade | derivados |
| %Real SUMIF | Producao→Atividade |
| MEDICOES | Medicao global |
| PRODUCAO | Producao (FK atividade) |
| DASHBOARD KPIs | view Indicador / query |

---

## 7. Pendências bloqueantes

| Pendência | Depende de |
|-----------|------------|
| schema Medicao | C2 |
| enum StatusAtividade | C4 |
| chave EAP/Atividade import | C3, C5 |
| valores KPI default | C1, C7, C10 |
| incluir pré-obra P2 | decisão U2 |

**Nada disto foi implementado.**
