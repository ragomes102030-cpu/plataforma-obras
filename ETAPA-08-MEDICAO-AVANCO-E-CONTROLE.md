# Etapa 8 — Medição, avanço físico e controle planejado versus realizado

**Data:** 21 de setembro de 2026  
**Status:** concluída  
**Objetivo:** conectar lançamentos de produção confirmados ao cronograma e apresentar avanço planejado, avanço realizado e desvios por atividade.

## O que foi concluído

Foi criado o endpoint protegido `planning.control`. Ele combina as atividades do cronograma, a data planejada de início da obra e os lançamentos de produção confirmados. Para cada atividade com quantidade planejada, o sistema calcula quantidade realizada, percentual planejado, percentual realizado e desvio em pontos percentuais.

O percentual planejado é calculado usando o início relativo da atividade, sua duração e a data de referência. Quando o CPM já foi executado, o início antecipado calculado é utilizado. Quando ainda não há resultado CPM, o sistema utiliza o `startOffset` original.

O percentual realizado considera somente lançamentos com status `confirmada`. Rascunhos não entram no avanço oficial, evitando que uma medição ainda não validada altere os indicadores da obra.

Foi adicionada a mutação `production.confirmEntry`. Ao confirmar uma medição, o sistema atualiza o progresso da atividade relacionada e seu status operacional. A regra define a atividade como `Em andamento` quando há avanço parcial e `Concluído` quando o realizado alcança a quantidade planejada.

A interface de Produção agora apresenta o botão **Confirmar** nos lançamentos em rascunho. Após a confirmação, o histórico de produção, as atividades e o painel de controle são atualizados.

A interface de Planejamento recebeu o painel **Planejado versus realizado**, com:

- avanço físico planejado da obra;
- avanço físico realizado;
- desvio consolidado em pontos percentuais;
- quantidade planejada e realizada por atividade;
- barra comparativa de planejado e realizado;
- identificação de atividades críticas;
- destaque visual para desvios negativos.

A implementação utiliza as estruturas de produção já existentes. Não foi criada uma nova tabela, pois `production_entries` já possuía obra, frente, equipe, unidade, atividade, data, quantidade, unidade de medição e status.

## Arquivos principais

| Arquivo | Alteração |
|---|---|
| `server/routers.ts` | Controle consolidado e confirmação de medições. |
| `client/src/components/ProductionView.tsx` | Botão para confirmar lançamentos. |
| `client/src/components/PlanningView.tsx` | Painel planejado versus realizado. |
| `client/src/index.css` | Barras, indicadores e estados visuais de desvio. |

## Validação

A etapa passou em `pnpm check`, `pnpm test --run`, `pnpm build` e `git diff --check`. O TypeScript passou. A suíte possui 16 arquivos e 66 testes aprovados. O build de produção foi concluído. O aviso de chunks maiores que 500 kB permanece registrado como tarefa futura de performance.

## Regras de controle

| Indicador | Regra |
|---|---|
| Planejado | Percentual do período decorrido dentro da janela CPM da atividade. |
| Realizado | Quantidade confirmada dividida pela quantidade planejada. |
| Desvio | Realizado menos planejado, em pontos percentuais. |
| Rascunho | Não altera o realizado oficial. |
| Confirmada | Entra no cálculo e atualiza o progresso da atividade. |

## O que ainda falta

O controle atual é físico e quantitativo. Ainda falta controlar custo realizado, valor agregado, custo orçado, CPI, SPI e curvas S.

Ainda falta vincular medições a documentos de evidência, anexos, aprovação por responsável e histórico de alterações. A confirmação atual é uma transição simples de rascunho para confirmada.

Também falta consolidar os resultados por frente, equipe, unidade, período e fase, além de gerar uma série histórica para a Linha de Balanço com planejado, realizado e tendência.

O cálculo de avanço planejado ainda utiliza dias corridos relativos. Deve evoluir para calendário de trabalho, feriados e data de corte parametrizável.

## Próxima etapa

A Etapa 9 será **Indicadores de prazo, produtividade, custo e curva S**. Ela deverá usar o planejado versus realizado para criar indicadores de desempenho da obra e preparar a camada de relatórios gerenciais.

## Commit

A entrega será versionada no GitHub com a mensagem `feat: add planned versus actual progress control`.

## Referências

[1]: ./PLANO-MESTRE-CONTROLE-OBRAS.md "Plano mestre de domínio e controle de obras"

[2]: ./ETAPA-07-GANTT-BASELINE-LINHA-DE-BALANCO.md "Etapa 7 — Gantt, baseline e Linha de Balanço"
