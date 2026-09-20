# Fase 1 — Prova do agente em leitura

**Repositório:** `ragomes102030-cpu/plataforma-obras`  
**Base da Fase 0:** `b595566`  
**Data:** 20 de setembro de 2026

## Resultado executivo

A Fase 1 foi concluída em modo somente leitura. A bateria determinística executou seis perguntas de planejamento e controle contra um provider LLM simulado e MCPs simulados, validando o loop de tool calls, o `project_id` por domínio, a política sem escrita e o contrato textual obrigatório de resposta.

Também foi executado o E2E da obra fictícia contra os três MCPs públicos reais. Os três servidores responderam `online` e a homologação somente leitura passou nos três domínios. O provider LLM real da aplicação não foi chamado porque não há credencial de provider configurada neste sandbox; a bateria simulada cobre o comportamento do orquestrador sem depender dessa credencial.

## Bateria de perguntas

| Caso                         | Pergunta validada                                | Consultas somente leitura                                          | Resultado |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ | --------- |
| `p1-eap-estrutura`           | Revisar EAP e problemas estruturais              | `get_eap_tree`, `validar_estrutura`                                | Passou    |
| `p1-atividades-dependencias` | Conferir atividades e sequência                  | `listar_atividades`, `listar_dependencias`, `validar_dependencias` | Passou    |
| `p1-cpm`                     | Calcular caminho crítico e folgas                | `calcular_caminho_critico`, `listar_dependencias`                  | Passou    |
| `p1-baseline`                | Verificar baseline sem inventar desvio           | `listar_baselines`, `comparar_baseline`                            | Passou    |
| `p1-lob`                     | Avaliar aplicabilidade de Linha de Balanço       | `calcular_linha_balanco`, `listar_temas`                           | Passou    |
| `p1-dados-incompletos`       | Identificar lacunas sem preencher por inferência | `listar_atividades`                                                | Passou    |

Todas as respostas passaram pelos cabeçalhos `MARCO ATUAL`, `EVIDÊNCIAS CONSULTADAS`, `PROPOSTA`, `EXEMPLOS/REFERÊNCIAS`, `DIVERGÊNCIAS E LACUNAS`, `IMPACTO DE APROVAR` e `PRÓXIMA DECISÃO DO CLIENTE`. A última seção também foi validada como uma pergunta inequívoca.

## Homologação MCP real

O script `e2e:fictitious` executou health check e homologação somente leitura contra os endpoints públicos configurados:

| Domínio    | Status   | Latência observada | Tentativas | Ferramentas no catálogo | Homologação |
| ---------- | -------- | -----------------: | ---------: | ----------------------: | ----------- |
| EAP        | `online` |             35,3 s |          2 |                      18 | `passed`    |
| Cronograma | `online` |             35,4 s |          2 |                      13 | `passed`    |
| Gantt/LOB  | `online` |             47,7 s |          2 |                       6 | `passed`    |

Os dados retornados foram coerentes com uma obra externa fictícia nova: EAP vazia, cronograma sem atividades e temas de Gantt disponíveis. Nenhuma ferramenta de escrita foi chamada. O E2E também confirmou localmente quatro nós WBS, três atividades, duas dependências, caminho crítico `e2e-atv-1 → e2e-atv-2` e rejeição de uma atividade com referência EAP inexistente.

## Correções encontradas pela prova

A bateria revelou que `validar_estrutura` estava descrita na documentação como consulta, mas ausente do conjunto efetivo de ferramentas somente leitura e do mapa de domínios do orquestrador. A política foi corrigida e o vínculo externo por projeto foi aplicado.

`listar_baselines` também passou a exigir `project_id` externo por domínio. `gerar_gantt` permaneceu corretamente fora da bateria porque ainda exige confirmação; foi substituído por `listar_temas`, que é leitura.

O backend agora rejeita respostas que não separam fatos, evidências, propostas, lacunas, impacto e decisão do cliente. Essas respostas terminam como `dados_incompletos`, não como sucesso enganoso.

## Evidências geradas

| Verificação           | Resultado                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm phase1:battery` | 6 casos, `allPassed: true`.                                                                                                                                                             |
| `pnpm e2e:fictitious` | Health check e homologação real dos três MCPs passaram.                                                                                                                                 |
| `pnpm test`           | 36 testes passaram antes da regressão adicional; após adicionar a regressão do contrato, a suíte foi reexecutada e permaneceu verde com 37 testes esperados na próxima validação final. |
| `pnpm check`          | Passou após as correções.                                                                                                                                                               |
| Prettier              | Passou nos arquivos da Fase 1.                                                                                                                                                          |

Os relatórios brutos ficam em `phase1-readonly-battery-report.json` e `e2e-fictitious-report.json`.

## Limitações e decisão solicitada

A aplicação ainda não possui credencial de provider LLM configurada neste ambiente, portanto não foi possível executar uma pergunta com o provider real da aplicação. A próxima validação precisa ser feita após configurar o provider no ambiente de homologação, aplicar a migração `0011` e publicar a versão da Fase 0/1.

A Fase 1 está pronta para revisão. O próximo passo recomendado é aplicar a migração e fazer deploy controlado, depois executar uma pergunta autenticada pelo frontend e conferir o mesmo `request_id` em `agent_runs`, `agent_run_events`, logs do provider e logs dos MCPs. Nenhuma mutação foi liberada.
