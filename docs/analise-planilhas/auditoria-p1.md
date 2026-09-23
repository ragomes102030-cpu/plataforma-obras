# Auditoria Individual — P1: `ARES_MODELO_EXCEL_NATIVO_MVP_LOB_PROFISSIONAL_FINAL_WORK(3).xlsx`

- **Arquivo**: 164.673 B · 19 abas · ~1.660 fórmulas · 9 charts · 20 tables
- **Modelo ARES** — sistema-piloto de LOB/CPM
- **Obra-amostra**: Residencial Piemarta · Empresa B Engenharia · 2 torres · 14 pavimentos · 6 aps/pav · 05/01/2026 → 30/06/2027 · data-base **18/08/2026**

---

## 1. Visão geral das abas

| Aba | Dim (l×c) | Fórmulas | Papel | Estado |
|-----|-----------|----------|-------|--------|
| DASHBOARD | 47×26 | 7 | Painel executivo | OK (1 chart) |
| CADASTRO | 247×26 | 0 | Obra + árvore de locais | OK (2 tables) |
| EAP | 91×10 | 85 | WBS 3 níveis | OK |
| ORÇAMENTO | 59×29 | 104 | Itens, composição, BDI | **11 errorCells** |
| SERVIÇOS | 72×13 | 55 | SERVICO = EAP×FRENTE×LOCAL | OK |
| PLANEJAMENTO | 52×26 | 165 | Fonte única do cronograma | OK |
| FRENTES | 41×9 | 16 | 15 frentes + equipes transitórias | OK |
| REDE | 21×7 | 0 | 17 precedências FS | OK |
| LINHA DE BALANÇO | 55×82 | **944** | Grade tempo×serviço | OK |
| CAMINHO CRÍTICO | 3×8 | 0 | CPM | **Stub** "aguarda modelagem" |
| GANTT | 22×61 | 0 | Barras semanais | OK |
| RECURSOS | 108×20 | 0 | MO/Equip/Material + equipes | OK (3 tables) |
| PRODUÇÃO | 47×26 | 117 | Apontamento diário | OK |
| MEDIÇÃO | 20×26 | 81 | Períodos, valores, %MED | **23 errorCells** |
| CONTROLE | 3×5 | 0 | — | **Stub** "aguarda modelagem" |
| INDICADORES | 11×26 | 6 | 7 indicadores + narrativa | Inconsistências (ver §4) |
| GRÁFICOS | 50×26 | 5 | 5 charts | OK |
| FÓRMULAS | 14×26 | 0 | Catálogo de 10 fórmulas | OK |
| CONFIGURAÇÕES | 50×9 | 1 | 10 listas + BDI TCU | BDI **0% = pendente** |

---

## 2. Modelo de dados (entidades e relações)

```
Obra (CADASTRO)
 └─ Local (árvore TORRE→PAVIMENTO→APARTAMENTO, ~245 linhas, IDs LOCAL-T2-P10-AP03)
      └─ Servico ←── Eap (DISCIPLINA/PACOTE/TRABALHO, EAP-001…085)
           └─← Frente (FRENTE-001…015, TIPO, STATUS)
                └─ Equipe (transitória em FRENTES; destino final RECURSOS)
 └─ OrcamentoItem (ORC-xxx) → Servico → [EAP, FRENTE, LOCAL]
      └─ Composicao (Recurso × coeficiente) → Recurso
 └─ Atividade (PLANEJAMENTO, 15 legacy LOC/FUN/EST/ALV/REV-ATV…)
      └─ Precedencia (REDE, FS + lag)
 └─ Producao (por Servico/dia)
 └─ Medicao (por período/serviço)
```

### Regras de domínio documentadas na própria planilha
- `SERVIÇO = EAP × FRENTE × LOCAL` (composição única; duplicatas **sinalizadas, não bloqueadas**)
- `ORÇADO ≠ CONTRATADO ≠ PRODUZIDO ≠ MEDIDO`
- `PLANEJAMENTO ≠ PRODUÇÃO · PRODUÇÃO ≠ MEDIÇÃO`
- `QTD_PLANEJADA ≠ QTD_PRODUZIDA ≠ QTD_MEDIDA`
- Derivados **não digitados**: VALOR_CONTRATADO, VALOR_ORCADO, CUSTO_DIRETO, PRECO_UNITÁRIO (com BDI)
- `VALOR_CONTRATADO = QTD_CONTRATADA × PRECO_UNITARIO` (derivado)

### Listas de domínio controlado (CONFIGURAÇÕES)
| Lista | Valores |
|-------|---------|
| LISTA_UNIDADES | m², m³, m, ml, un, vb, pt, kg, t, h |
| LISTA_TIPOS_EAP | DISCIPLINA, PACOTE, TRABALHO |
| LISTA_TIPOS_FRENTE | EXECUÇÃO, ACABAMENTO, INSTALAÇÃO |
| LISTA_STATUS_SERVICO | Planejado, Liberado, Em execução, Concluído, Cancelado |
| LISTA_TIPOS_RECURSO | MÃO DE OBRA, EQUIPAMENTO, MATERIAL |
| + | status recurso/frente/equipe, tipos item, status planejamento |

### Fórmulas canônicas (aba FÓRMULAS)
| Sigla | Fórmula | Unidade |
|-------|---------|---------|
| P | Quantidade ÷ Prazo | un/h |
| D | Fim − Início + 1 | dias |
| %Prod | Qp ÷ Qc | % |
| %Med | Qm ÷ Qc | % |
| Vm | Qm × P | R$ |
| S | Vc − Vm | R$ |
| Cr | Qp × P | R$ |
| Pm | Q ÷ E | — |
| %Plan | Qpl ÷ Qc | % |
| Sp | Qpl × P | R$ |

### BDI (CONFIGURAÇÕES F40:I49)
Componentes: Admin Central, Seguros, Garantias, Lucro, Tributos…  
Fórmula TCU: `[(1+AC)(1+S)(1+G)(1+R)(1+DF)(1+L)/(1−T)]−1`  
**BDI_TOTAL = 0 → PENDENTE de definição com fonte oficial.**

---

## 3. PLANEJAMENTO — fonte única do cronograma

- **15 atividades legadas** (`LOC-ATV`, `FUN-ATV`, `EST-ATV`, `ALV-ATV`, `REV-ATV`…)
- Colunas derivadas: H (duração), J (%plan), M (%real), N (status), Q (derivado)
- Status (dados): `concluido`, `em_andamento`, `atrasado`, `planejado`
- Fórmula de status (CONFIG / PLANEJAMENTO):
  ```
  IF status=CANCELADO/BLOQUEADO → MANUAL
  ELSE IF SEM DATAS → planejado
  ELSE IF %real=100% → concluido
  ELSE IF fim < TODAY() → atrasado
  ELSE → em_andamento
  ```
- **GANTT deriva de PLANEJAMENTO** (regra declarada na planilha)

---

## 4. Indicadores (INDICADORES) — inconsistências encontradas

| Indicador | VALOR mostrado | Leitura narrativa | Problema |
|-----------|----------------|-------------------|----------|
| PRODUÇÃO | **0%** | "produção avançou 72,5% do planejado" | valor × narrativa divergem |
| MEDIÇÃO | 46,3% (texto) × 0% (valor) | — | unidade/origem divergem |
| PRAZO | — | — | OK |
| SERVIÇOS ATRASADOS | — | — | OK |
| SALDO | R$ 3.462.300 | — | OK (contrato R$ 6.444.600) |
| MÃO DE OBRA | 8 equipes · 2920 h · 365 col-dia · prod. média 46,2 | — | OK |

→ **Não portar KPIs para o sistema sem revalidar a contagem por trás.**

---

## 5. Qualidade de dados / erros

| Aba | Erros | Causa provável |
|-----|-------|----------------|
| ORÇAMENTO | 11 `errorCells` | lookups `INDEX/MATCH` com `#OCLI_NOTEVAL!` (não avaliado pelo leitor CLI) |
| MEDIÇÃO | 23 `errorCells` | `#DIV/0!` contrato/preços zerados + `#VALUE!` em SALDO/%MED |
| CAMINHO CRÍTICO | 0 fórmulas | stub |
| CONTROLE | 0 fórmulas | stub |
| LOB | 944 fórmulas | OK (maior densidade) |

→ **Ações**: recalcular em Excel/LibreOffice real antes de confiar em caches; stubs CPM/CONTROLE = backlog.

---

## 6. Avaliação como referência de produto

**Pontos fortes**
- Modelo relacional mais completo (19 abas integradas)
- Regras de domínio escritas no próprio arquivo (anti-conflito)
- Domínios controlados + catálogo de fórmulas
- LOB + rede de precedências + stub de caminho crítico (roadmap)

**Pontos fracos / riscos**
- 34 células com erro
- BDI zerado (pendente)
- Indicadores com narrativa ≠ valor
- Equipes "transitórias" em duas camadas (FRENTES + RECURSOS)
- Abas stub (Caminho Crítico, Controle)

**Veredito**: **fonte de verdade primária** para entidades e regras; validar contas e BDI antes de portar KPIs.
