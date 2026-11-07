# Aceite demonstrativo — Escola e Aurora v9 (07/11/2026)

**OBRAS FICTÍCIAS:** esta aprovação de QA documenta consistência de cálculos e dados da demonstração. Não representa engenharia assinada, ART/RRT, obra executada, preços de mercado ou faturamento.

| Indicador | Escola | Aurora |
|---|---|---|
| Projeto | 25 | 7 |
| Plano QA aprovado | v9 ID 47 | v9 ID 46 |
| Plano anterior histórico | v8 ID 43 | v8 ID 34 |
| Orçamento QA aprovado | v2 ID 13 | v2 ID 12 |
| Orçamento anterior arquivado | v1 ID 11 | v1 ID 4 |
| Baseline QA ativa | ID 13 | ID 12 |
| Baseline histórica | ID 11 | ID 9 |
| EAP nós/folhas | 37/27 | 69/53 |
| Atividades/vínculos CPM | 30/39 | 53/71 |
| Prazo CPM e atividades críticas | 210 dias / 16 | 580 dias / 24 |
| LOB parcelas | 20 | 169 |
| Custo bruto estimado SOMENTE SIMULADO | R$ 2.396.000,00 | R$ 4.010.994,32 |
| Boletim de medição | QA rascunho ID 5 | QA rascunho ID 4 |

## Evidência de engenharia para simulação
- MCP EAP validar_estrutura_eap: ambas estruturas válidas, sem erros, 37 e 69 nós.
- MCP Cronograma calcular_cpm_com_evidencia: redes válidas, 210/580 dias úteis; **zero divergências em ES, EF, LS, LF, folga total e folga livre** com o banco.
- LOB: zero parcela órfã, invertida, didática legada, vinculada a atividade de QA, com quantitativo divergente ou sem defasagem em série repetitiva; zero CPM obsoleto.
- EAP: 27/27 e 53/53 folhas com quantidade, unidade e localização. As localizações simuladas NÃO são levantamentos de plantas.
- Orçamentos v2: 27 e 53 itens, preços positivos, rastreáveis à EAP/atividade, identificados SIMULACAO_QA e marcados como exceção de preço; preços oficiais de SEINFRA/SINAPI **não verificados**.
- Medição: um boletim de demonstração em rascunho por obra, nenhum atestado, aprovado, faturado ou pago.
- Baseline: uma ativa por obra, anteriores preservadas como históricas. Aceite apenas fictício auditado em agent_decisions e project_audit_events.

## Ressalvas de simulação
- Escola: locação em dois blocos e frente geral são hipóteses didáticas. Serviços administrativos não foram indevidamente transformados em escadinhas.
- Aurora: os 7 setores da atividade Ferragens e acessórios em 4 dias exigem equipes paralelas na simulação. Na v9 foram removidas 18 atividades de QA, 27 dependências e 25 nós usados em QA/rateios; a v8 permaneceu inalterada.
- Os orçamentos são cenários internos de software. Não servem para preço de obra real, licitação, pagamento ou ateste fiscal.
- Aceite de QA por delegação do usuário não equivale à assinatura de um engenheiro habilitado.
- A navegação autenticada na interface final hospedada no Render **ainda não foi comprovada**.
- Scripts de reconstrução são one-shot com guardas; não os executar novamente.

## Rastreabilidade
- scripts/qa/reconstruir-lob-escola-aurora-v9-20261107.sql (PR #364)
- scripts/qa/orcamentos-demonstrativos-v9-20261107.sql
- scripts/qa/limpar-qa-aurora-v9-20261107.sql
- scripts/qa/aceite-demonstrativo-v9-20261107.sql
- Issues Escola #357 e Aurora #358.
