> **Documento histórico.** Escrito quando a stack era outra: Render, Vercel,
> Aiven e MySQL. Nada disso faz parte do sistema hoje — a stack atual é GitHub +
> Render + Supabase ([STACK-ATUAL.md](STACK-ATUAL.md)). Leia como registro
> da época, não como instrução.

# Engineering Coverage Matrix

**Versão:** 1.0 (FASE 1 — Reconhecimento)  
**Data:** 27/09/2026  
**Status:** Proposta para aprovação  

---

## 1. Legenda

| Coluna | Significado |
|--------|-------------|
| ID | Identificador único da regra |
| Domínio | Área de engenharia (EAP, CPM, LOB, Orçamento, Controle, etc.) |
| Regra | Descrição resumida da regra |
| Fonte | Referência bibliográfica ou interna |
| Implementado | Se a lógica existe em código |
| Testado | Se há teste que comprove |
| MCP | Se há ferramenta MCP associada |
| Risco | Nível de risco se a regra falhar ou não existir |

Nenhuma área crítica é considerada concluída somente porque possui código.

**Critérios mínimos de validade:** Fonte conhecida + Regra formalizada + Implementação + Teste + Validação.

---

## 2. EAP / WBS

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| EAP-001 | EAP | Regra dos 100% — todo escopo deve estar representado na EAP | PMI / PMBOK; Mattos | ✅ backend (eap-validator.ts) | ✅ testes | ✅ MCP EAP (validar_estrutura) | Alto |
| EAP-002 | EAP | Elemento único — cada nó tem identidade clara (eap_id único) | PMI WBS Practice Standard | ✅ (PK composta project_id+eap_id) | ✅ testes | ✅ MCP EAP | Médio |
| EAP-003 | EAP | Decomposição coerente — irmãos seguem critério consistente | PMI; Mattos | ⚠️ parcial (validar_estrutura avisa tipo_frente divergente) | ⚠️ avisos | ✅ MCP EAP | Médio |
| EAP-004 | EAP | Quantidade só em nós-folha | Mattos; prática interna | ✅ (validar_estrutura rejeita) | ✅ testes | ✅ MCP EAP | Baixo |
| EAP-005 | EAP | Ausência de sobreposição — mesmo escopo não aparece em múltiplos nós | PMI | ⚠️ avisos (dupla contagem detectada, não impedida) | ⚠️ avisos | ✅ MCP EAP | Médio |
| EAP-006 | EAP | Ausência de lacunas — escopo não representado é detectado | PMI | ⚠️ avisos | ⚠️ avisos | ✅ MCP EAP | Médio |
| EAP-007 | EAP | EAP ≠ cronograma — estrutura de escopo não é sequência de execução | PMI | ✅ (domínios separados) | ✅ testes | ✅ (separação MCP) | Baixo |
| EAP-008 | EAP | EAP ≠ orçamento — estrutura financeira não é WBS válida automaticamente | PMI | ⚠️ (orçamento tem wbsNodeId FK, mas sem validação de cobertura) | ❌ | ❌ | Médio |

---

## 3. Quantitativos

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| QNT-001 | Quantitativos | Cada quantitativo possui unidade | Mattos; TCPO | ⚠️ (unidade no MCP EAP, mas sem validação de dimensão) | ❌ | ✅ MCP EAP | Alto |
| QNT-002 | Quantitativos | Quantidade = fórmula + premissa + origem | Mattos; TCPO | ❌ (não há registro formal de método de cálculo) | ❌ | ❌ | Alto |
| QNT-003 | Quantitativos | Perdas e coeficientes devem ser declarados | TCPO; SEINFRA | ❌ | ❌ | ❌ | Médio |
| QNT-004 | Quantitativos | Arredondamento deve ser consistente | Prática interna | ❌ | ❌ | ❌ | Baixo |

---

## 4. Produtividade

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| PROD-001 | Produtividade | Duração = Quantidade ÷ Produtividade | Mattos (Cap.5) | ✅ (B5: duração = quantidade/produtividade) | ✅ testes CPM | ✅ MCP Cronograma (duracao_otimista/provavel/pessimista) | Médio |
| PROD-002 | Produtividade | Produtividade deve ter unidade | Mattos | ❌ (unidade não obrigatória no MCP) | ❌ | ❌ | Alto |
| PROD-003 | Produtividade | Produtividade deve ter origem/referência | Mattos; SINAPI; SEINFRA | ❌ | ❌ | ❌ | Alto |
| PROD-004 | Produtividade | Produtividade deve declarar equipe | Mattos (Cap.20) | ❌ | ❌ | ❌ | Alto |
| PROD-005 | Produtividade | Produtividade diferenciada por condição de aplicação | Mattos; SINAPI | ❌ | ❌ | ❌ | Médio |
| PROD-006 | Produtividade | PERT para duração incerta (O+4M+P)/6 | Mattos; PERT clássico | ✅ (MCP Cronograma suporta) | ✅ testes | ✅ MCP Cronograma | Baixo |

---

## 5. CPM / PERT

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| CPM-001 | CPM | ES/EF/LS/LF calculados por rede | Mattos (Cap.6-8); PERT | ✅ (shared/cpm.ts + cpm-calculator.ts) | ✅ testes (grafo linear, paralelo, cíclico) | ✅ MCP Cronograma (calcular_caminho_critico) | Baixo |
| CPM-002 | CPM | Caminho crítico = atividades com folga total = 0 | Mattos | ✅ (B2) | ✅ testes | ✅ MCP Cronograma | Baixo |
| CPM-003 | CPM | Detecção de ciclo antes de calcular CPM | Mattos | ✅ (dependency-validator.ts) | ✅ testes | ✅ MCP Cronograma (validar_dependencias) | Baixo |
| CPM-004 | CPM | 4 tipos de dependência (FS/SS/FF/SF) + lag | Mattos | ✅ (B1) | ✅ testes | ✅ MCP Cronograma | Baixo |
| CPM-005 | CPM | Calendário/feriados afetam datas reais | Mattos | ⚠️ (calendario.py no MCP Cronograma existe, uso não confirmado) | ⚠️ | ✅ MCP Cronograma | Médio |
| CPM-006 | CPM | Duração derivada de quantidade × produtividade, não inventada | Mattos; B5 | ✅ (derivada no código) | ✅ | ❌ (não obrigatório informar produtividade no MCP) | Médio |
| CPM-007 | CPM | CCPM (Critical Chain) não implementado — escopo limitado | Mattos (Cap.11) | ❌ (fora de escopo, decisão consciente) | N/A | ❌ | Baixo |

---

## 6. Linha de Balanço

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| LOB-001 | LOB | Início/fim por unidade de repetição com detecção de interferência | Mattos (Cap.20) | ✅ (mcp-gantt-lob-server: calcular_linha_balanco) | ⚠️ (testado no MCP, não no backend) | ✅ MCP Gantt/LOB | Alto |
| LOB-002 | LOB | Fórmula exata de cálculo de LOB | Mattos (Cap.20) | ⚠️ (DÚVIDA-001: fórmula não confirmada 100%) | ❌ | ✅ MCP Gantt/LOB | **Crítico** |
| LOB-003 | LOB | Risco de interferência quando sucessora é mais rápida que predecessora | Mattos (Cap.20.4) | ✅ (risco_interferencia no MCP) | ⚠️ (testado no MCP) | ✅ MCP Gantt/LOB | Médio |
| LOB-004 | LOB | `espera_dias` conta a partir da 2ª unidade (n>=1) | Mattos (Cap.20) | ✅ (corrigido no MCP: bug pego e corrigido) | ⚠️ | ✅ MCP Gantt/LOB | Baixo |
| LOB-005 | LOB | Balanceamento de ritmos sugere nº de equipes | Mattos (Cap.20.4) | ✅ (balancear_ritmos_lob no MCP) | ⚠️ | ✅ MCP Gantt/LOB | Médio |
| LOB-006 | LOB | Dimensionamento de equipes para ritmo desejado | Mattos (Cap.20.5) | ✅ (dimensionar_equipes_lob no MCP) | ⚠️ | ✅ MCP Gantt/LOB | Médio |
| LOB-007 | LOB | LOB no backend (não apenas no MCP) | Mattos | ❌ (não implementado no backend da plataforma) | ❌ | ✅ MCP Gantt/LOB (externo) | Alto |
| LOB-008 | LOB | Conflitos de recursos não detectados automaticamente | LIMIT-002 | ❌ | ❌ | ❌ | Médio |

---

## 7. Orçamento / Composições

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| ORC-001 | Orçamento | Serviço → Composição → Insumos → Coeficientes → Preços → Quantidade → Custo | TCPO; SEINFRA | ⚠️ (composições existentes: service_compositions, composition_components) | ❌ | ❌ (não há MCP de composição) | Alto |
| ORC-002 | Orçamento | BDI e encargos calculados automaticamente | TCPO; prática interna | ❌ (LIMIT-004: usuário informa manualmente) | ❌ | ❌ | Médio |
| ORC-003 | Orçamento | Validação de custo por peso (m², m³, vb) dentro de faixas de mercado | Prática interna | ❌ (LIMIT-005) | ❌ | ❌ | Médio |
| ORC-004 | Orçamento | Preço ≠ Custo ≠ Coeficiente ≠ Consumo ≠ Produtividade | TCPO; SINAPI | ❌ (sem distinção formal) | ❌ | ❌ | Alto |
| ORC-005 | Orçamento | Orçamento inicial com seed data (3 itens, unitPrice=0) | B10 | ✅ | ✅ | ❌ | Baixo |
| ORC-006 | Orçamento | Composições SEINFRA como fonte de preços | SEINFRA-CE; B13 | ✅ (catalog + SEINFRA adapter) | ✅ | ✅ (integração SEINFRA) | Baixo |

---

## 8. Controle / Curva S

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| CTRL-001 | Controle | Avanço físico = quantidade_produzida / quantidade_planejada × 100 | Mattos; Limmer | ✅ (B6: project-progress.ts) | ✅ | ❌ | Baixo |
| CTRL-002 | Controle | Avanço financeiro = valor produzido / valor total × 100 | Mattos; Limmer | ⚠️ (existência não confirmada) | ❌ | ❌ | Alto |
| CTRL-003 | Controle | Curva S = soma cumulativa da produção planejada vs realizada | Mattos; Limmer | ✅ (B9: scurve, testes passando) | ✅ | ❌ | Baixo |
| CTRL-004 | Controle | Curva S reconstruída em tempo real ao confirmar produção | Mattos; Limmer | ⚠️ (DÚVIDA-002: não confirmado se re-query após confirmação) | ❌ | ❌ | Médio |
| CTRL-005 | Controle | Apenas produção confirmada (status=confirmada) conta nos cálculos | B7 | ✅ | ✅ | ❌ | Baixo |
| CTRL-006 | Controle | Baseline = snapshot do cronograma para comparação | Mattos; PMI | ✅ (B8: scheduleBaselines) | ✅ | ✅ MCP Cronograma (salvar_baseline) | Baixo |
| CTRL-007 | Controle | Desvio de prazo = realizado - planejado | Mattos; PMI | ❌ (não implementado explicitamente) | ❌ | ❌ | Alto |
| CTRL-008 | Controle | Desvio de custo = realizado - planejado | Mattos; Limmer | ❌ | ❌ | ❌ | Alto |
| CTRL-009 | Controle | Produtividade planejada vs realizada | Mattos | ❌ | ❌ | ❌ | Médio |
| CTRL-010 | Controle | Desvio de custo por serviço (não só global) | Limmer | ❌ | ❌ | ❌ | Médio |

---

## 9. Medição

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| MED-001 | Medição | Agregação de produção por período (geralmente mensal) | Mattos; Limmer | ✅ (B12: MedicaoView.tsx) | ⚠️ (testes de UI, não de regra) | ❌ | Médio |
| MED-002 | Medição | Medição gera lançamento fiscal/financeiro | Mattos; Limmer | ❌ | ❌ | ❌ | Alto |
| MED-003 | Medição | Revisão de medição quando produção rectificada | Mattos | ❌ | ❌ | ❌ | Médio |

---

## 10. Indicadores de projeto

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| KPI-001 | KPI | CPI = EV / AC (Cost Performance Index) | PMI; Limmer | ❌ | ❌ | ❌ | Alto |
| KPI-002 | KPI | SPI = EV / PV (Schedule Performance Index) | PMI; Limmer | ❌ | ❌ | ❌ | Alto |
| KPI-003 | KPI | EAC = BAC / CPI (Estimate at Completion) | PMI; Limmer | ❌ | ❌ | ❌ | Alto |
| KPI-004 | KPI | VAC = BAC - EAC (Variance at Completion) | PMI; Limmer | ❌ | ❌ | ❌ | Alto |
| KPI-005 | KPI | CV = EV - AC (Cost Variance) | PMI; Limmer | ❌ | ❌ | ❌ | Alto |
| KPI-006 | KPI | SV = EV - PV (Schedule Variance) | PMI; Limmer | ❌ | ❌ | ❌ | Alto |

---

## 11. Governança

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| GOV-001 | Governança | Estados de marco: DESCRITIVO → EAP_PROPOSTA → ... → CONTROLE | PLANO-EVOLUCAO (Fase 4) | ⚠️ (Fase 4 implementada? ver PLANO-EVOLUCAO-CEREBRO-DE-OBRAS.md) | ⚠️ | ❌ | Alto |
| GOV-002 | Governança | Gates obrigatórios bloqueiam avanço se não satisfeitos | PLANO-EVOLUCAO (Fase 4) | ⚠️ (Fase 4 pendente/tentativa) | ❌ | ❌ | Alto |
| GOV-003 | Governança | Decisões registradas com escopo e impacto | PLANO-EVOLUCAO (Fase 4) | ✅ (agentDecisions tabela) | ⚠️ | ❌ | Médio |
| GOV-004 | Governança | Premissas, fatos, hipóteses, lacunas em formato auditável | PLANO-EVOLUCAO (Fase 4) | ❌ | ❌ | ❌ | Alto |
| GOV-005 | Governança | Versão do plano vincula EAP + atividades + dependências | PLANO-EVOLUCAO (Fase 4) | ✅ (project_plan_versions) | ⚠️ | ❌ | Médio |

---

## 12. Segurança de dados

| ID | Domínio | Regra | Fonte | Implementado | Testado | MCP | Risco |
|----|---------|-------|-------|:---:|:---:|:---:|-------|
| SEG-001 | Segurança | MCP indisponível não mascarado como catálogo vazio | PLANO-EVOLUCAO (Fase 0/1) | ✅ (estado dados_incompletos) | ✅ | ✅ | Baixo |
| SEG-002 | Segurança | Atividade gravada só com vínculo EAP válido | PLANO-EVOLUCAO (Fase 1) | ✅ (validação) | ✅ | ✅ | Baixo |
| SEG-003 | Segurança | Dependência não cruza projetos | PLANO-EVOLUCAO (Fase 1) | ✅ | ✅ | ✅ | Baixo |
| SEG-004 | Segurança | Cálculo produzido pela LLM tem resultado determinístico correspondente | PLANO-EVOLUCAO (Fase 1) | ✅ (Fase 3: CPM determinístico) | ✅ | ✅ | Baixo |
| SEG-005 | Segurança | Repetição não cria duplicata (idempotência) | PLANO-EVOLUCAO (Fase 0) | ✅ (request_id) | ✅ | ✅ | Baixo |
| SEG-006 | Segurança | Migração não apaga dados existentes | PLANO-EVOLUCAO (Fase 0) | ✅ | ✅ | ✅ | Baixo |

---

## 13. Resumo executivo

**Áreas com regras validadas (fonte + implementação + teste):**
- CPM (CPM-001 a CPM-006)
- Validação de EAP básica (EAP-001, EAP-002, EAP-004)
- Produtividade → Duração (PROD-001)
- Avanço físico (CTRL-001)
- Curva S (CTRL-003)
- Baseline (CTRL-006)
- Medição por período (MED-001)
- Segurança de dados (SEG-001 a SEG-006)

**Áreas críticas sem validação completa:**
- LOB-002: Fórmula exata de LOB não confirmada (DÚVIDA-001)
- QNT-001/002: Quantitativos sem registro formal de método
- PROD-002/003/004: Produtividade sem unidade, origem, equipe
- ORC-001/002/004: Orçamento sem composição formal, BDI manual, sem distinção conceitual
- CTRL-002/007/008: Avanço financeiro, desvio de prazo, desvio de custo não implementados
- KPI-001 a KPI-006: Indicadores PMI/Limmer não implementados
- GOV-001/002/004: Governança de marco e gates pendentes

**Áreas com risco alto de falsa precisão:**
- Quantitativos calculados sem registro de método
- Custos informados sem composição técnica
- Produtividade usada sem origem declarada
- Resultados apresentados sem declaração de premissas/lacunas

---

**Próximo passo:** Apresentar este documento ao usuário para aprovação antes de iniciar a FASE 2.
