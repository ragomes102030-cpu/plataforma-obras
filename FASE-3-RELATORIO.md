# Fase 3 — Validações determinísticas e CPM

**Data:** 20 de setembro de 2026  
**Base:** `9c86105` — validadores determinísticos  
**Estado:** concluída e publicada.

## Resultado

A Plataforma Obras agora executa validações determinísticas no backend antes de formar o contexto do agente. A LLM recebe o resultado para explicar, mas não pode substituir os cálculos.

O fluxo `agent.chat` calcula:

- validação estrutural da EAP;
- referências órfãs, IDs duplicados e códigos duplicados;
- auto dependências e dependências inexistentes;
- ciclos de dependência;
- dependências cruzando projetos ou com `projectId` inconsistente;
- lag inválido;
- início e término cedo;
- início e término tarde;
- folgas;
- duração total;
- caminho crítico.

O snapshot possui três estados:

| Estado         | Significado                                                                     |
| -------------- | ------------------------------------------------------------------------------- |
| `valid`        | Dados suficientes e nenhuma falha estrutural bloqueadora.                       |
| `blocked`      | Existe erro determinístico ou erro operacional que impede uma conclusão válida. |
| `insufficient` | Não há dados suficientes para calcular uma rede completa.                       |

Quando o estado é `blocked` ou `insufficient`, o prompt instrui o agente a apresentar a lacuna e não declarar cronograma, caminho crítico ou aprovação como válidos.

## Auditoria

| Verificação        | Resultado                             |
| ------------------ | ------------------------------------- |
| `pnpm check`       | Passou                                |
| `pnpm test`        | 61 testes passaram em 15 arquivos     |
| `pnpm build`       | Passou                                |
| Prettier           | Passou                                |
| `git diff --check` | Passou antes do commit                |
| Banco              | Nenhuma migração ou mutação           |
| MCP                | Somente leitura                       |
| Deploy             | Render `live`; HTTP 200 em `/healthz` |

O build exibe apenas o aviso conhecido de chunks frontend acima de 500 kB.

## Checkpoints de código e publicação

| Commit    | Resultado                                            |
| --------- | ---------------------------------------------------- |
| `9c86105` | Validadores determinísticos e CPM                    |
| `e54d10f` | Snapshot determinístico conectado ao agente          |
| `6fd7863` | Plano mestre atualizado e deploy automático iniciado |

O commit `6fd7863` foi detectado pelo serviço Render `plataforma-obras-api` como deploy `dep-dao82368bjmc73b4u1tg`, com status final `live` e término às `2026-09-21T00:59:33Z`.

## Limitações preservadas

A Fase 3 não cria obras, não grava EAP, não salva baseline, não sincroniza outbox e não executa mutações MCP. Calendários, feriados, produtividade e Linha de Balanço continuam fora do cálculo CPM desta fase.

## Próxima continuação

A próxima fase é a **Fase 4 — Governança, versões e gates da obra**. O primeiro passo deve ser criar a versão do plano e os gates de aprovação, preservando o caminho legado e sem liberar gravação automática.
