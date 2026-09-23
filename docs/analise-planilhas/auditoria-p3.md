# Auditoria Individual — P3: `Relatorio_Progresso_Obra_PROFISSIONAL.xlsx`

- **Arquivo**: 16.562 B · 6 abas · 117 fórmulas · relatório executivo enxuto
- **Obra-amostra**: Residencial Piemarta · Empresa B Engenharia · **data-base 15/07/2026**
- **Contrato**: R$ 18.450.000 · medido R$ 7.933.500 · saldo R$ 10.516.500
- **Prazo**: 05/01/2026 → 30/06/2027

---

## 1. Visão geral das abas

| Aba | Dim (l×c) | Fórmulas | Papel | Estado |
|-----|-----------|----------|-------|--------|
| DASHBOARD | 18×10 | 20 | 6 KPIs + contagem por status | OK |
| RESUMO | 16×6 | 0 | Identificação + resumo textual | OK |
| CRONOGRAMA | 18×13 | 74 | 14 atividades + %Plan/%Real/Status | OK (motor) |
| GANTT | 17×20 | 0 | Visual **mensal** (01/26→06/27) | OK |
| MEDICOES | 10×9 | 22 | 6 medições globais do contrato | OK |
| PRODUCAO | 59×5 | 1 | Lancamentos que alimentam %Real | 1 fórmula + dados |

---

## 2. DASHBOARD

### KPIs (6 blocos)
| Métrica | Valor de referência (amostra) |
|---------|-------------------------------|
| Avanço real (físico) | 0,3893 (38,93%) |
| Avanço planejado | 0,4095 (40,95%) |
| Desvio | −0,0202 (−2,02 p.p.) |
| Contrato | R$ 18.450.000 |
| Medido | R$ 7.933.500 |
| Saldo | R$ 10.516.500 |

### Tabela situação por status
| Status | Qtd | % do total |
|--------|-----|------------|
| Concluído | … | … |
| Em andamento | … | … |
| Atrasado | … | … |
| Não iniciado | … | … |

→ Contagem alimentada do CRONOGRAMA (COUNTIF por status).

---

## 3. RESUMO

- Bloco de identificação: obra, empresa, cliente, endereço, responsável
- Resumo textual de escopo/prazo/situação
- Data-base do relatório: **15/07/2026** (diverge de P1: 18/08/2026)

---

## 4. CRONOGRAMA — motor do relatório

### Estrutura (14 atividades, código hierárquico)
| Código | Exemplo |
|--------|---------|
| `01.01` | … |
| `02.01` | … |
| `03.01` / `03.02` | … |
| `07.01` | … |

### Colunas
| Col | Campo | Fórmula / origem |
|-----|-------|------------------|
| A | Código | `01.01` (hierárquico) |
| B | Descrição da atividade | texto |
| C | Frente | EXECUCAO / ACABAMENTO / INSTALACAO |
| D | Pavimento | SB, PL, P01–P05…, GERAL |
| E | Início | data |
| F | Fim | data |
| G | **Duração** | `=(Fim−Inicio)+1` |
| H | Quantidade | num |
| I | Unidade | vb, m3, m2, m |
| J | **Produtividade** | `=Quantidade/Duração` |
| K | %Planejado | `=área da curva / formula de distribuição` |
| L | %Real | **SUMIF da aba PRODUCAO** |
| M | Status | Concluido / Em andamento / Nao iniciado |

### Regras explícitas
- `Duração = Fim − Início + 1` (dias corridos inclusivos)
- `Produtividade = Quantidade ÷ Duração`
- `%Real` ← `PRODUCAO` (**"CRONOGRAMA le esta aba por SUMIF"**)
- Dataset **não usa "Atrasado"** (só 3 status), embora o DASHBOARD tenha linha para ele

### Frentes (mesmo vocabulário de P1, sem IDs)
EXECUCAO · ACABAMENTO · INSTALACAO  
(P1: FRENTE-001…015 com TIPO idêntico + STATUS)

---

## 5. GANTT

- **1 célula = 1 mês** (mensal)
- Colunas: `01/26` → `06/27` (18 meses)
- Sem formatação condicional complexa (só visual de barras)
- Deriva do CRONOGRAMA (mesmas linhas)

---

## 6. MEDICOES — modelo de medição **global**

### Estrutura (6 medições)
| Col | Campo | Fórmula |
|-----|-------|---------|
| A | Nº | `MED-01` … `MED-06` |
| B | N | 1…6 (ordem) |
| C | Data | data |
| D | **% Acumulado** | `=ValorAcum ÷ Contrato` |
| E | **Valor Acumulado** | soma corrida |
| F | **Parcela** | `=ValorAcum − Anterior` |
| G | **Saldo a Medir** | `=Contrato − ValorAcum` |
| H | Status | Aprovada / Em analise |
| I | Obs | texto |

### Características
- Medições do **contrato inteiro** (não por serviço)
- Contrato = R$ 18.450.000 (constante)
- Sem vínculo FK para serviços/EAP — é **financeiro agregado**
- **Conflita com P1 MEDIÇÃO** (que é por serviço/período)

---

## 7. PRODUCAO — fonte do %Real

### Colunas (5)
| Col | Campo |
|-----|-------|
| A | Data |
| B | Código Atividade (FK → CRONOGRAMA) |
| C | Qtd Executada |
| D | Equipe (Equipe A…D) |
| E | Observacao |

### Comportamento
- Linhas 5–10 preenchidas (amostra); resto vazio
- 1 fórmula no arquivo (agregação)
- **Única fonte de %Real** do CRONOGRAMA (SUMIF por código)
- Minimalista: sem frente, sem local, sem QTD prevista, sem meta

---

## 8. Comparação rápida com P1

| Aspecto | P3 | P1 |
|---------|----|----|
| data-base | 15/07/2026 | 18/08/2026 |
| Contrato | R$ 18.450.000 | R$ 6.444.600 (saldo 3.462.300) |
| Atividades | 14 (`01.01`) | 15 (`EST-ATV2`…) |
| Status usados | 3 (sem atrasado nos dados) | 4–6 (inclui atrasado, bloqueado, cancelado) |
| Medição | Global (MED-01…06) | Por serviço/período |
| %Real | SUMIF PRODUCAO→CRONOGRAMA | PRODUÇÃO → SERVIÇOS/INDICADORES |
| Gantt | Mensal | Semanal |
| Unidades | m3, m2, m, vb | m³, m², m, ml, un, vb, pt, kg, t, h |
| Pavimento | Coluna textual | Árvore LOCAL completa |

→ **Mesma obra, modelagens divergentes** = conflito central a resolver (ver `conflitos.md`).

---

## 9. Avaliação como referência

**Pontos fortes**
- **Enxuto e executivo** — bom para dashboard de cliente
- Fórmulas simples e legíveis (Duração, Produtividade, %Acum, Parcela)
- Medições globais numeradas (padrão contratual brasileiro)
- PRODUCAO→CRONOGRAMA via SUMIF (fluxo claro)
- Bom candidato a **tela de relatório mensal** do produto

**Pontos fracos**
- Poucas dimensões de produção (sem local/frente/meta)
- Sem precedências, sem recursos, sem orçamento detalhado
- Vocabulário de status incompleto (sem atrasado nos dados)
- Conflita com P1 em data-base, contrato, granularidade de medição

**Veredito**: **referência para dashboard executivo + modelo de medição global**; complementa P1 (que é operacional) — não substitui.
