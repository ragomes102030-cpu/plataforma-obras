# Etapa 7 — Gantt calculado, baseline e Linha de Balanço

**Data:** 21 de setembro de 2026  
**Status:** concluída  
**Objetivo:** consolidar a visualização do cronograma calculado, congelar baselines e expor a Linha de Balanço para as atividades planejadas.

## O que foi concluído

A seção Cronogramas voltou a apresentar o painel de planejamento físico junto da visualização Gantt existente. O Gantt recebe as atividades persistidas com os offsets atualizados pelo CPM, portanto os inícios antecipados calculados passam a aparecer na linha do tempo. A visualização continua oferecendo as abas Gantt, tabela e Linha de Balanço.

A Linha de Balanço existente foi reconectada ao fluxo atual de atividades e quantidades planejadas. Ela utiliza a progressão relativa das atividades para exibir o ritmo planejado por fase. O módulo Linha de Balanço da navegação continua abrindo diretamente nessa visão.

Foi criado o conceito de baseline de cronograma. O usuário pode congelar o estado atual da obra com um nome identificável. O sistema captura as atividades existentes, início relativo, duração e resultados CPM disponíveis naquele momento. O baseline preserva uma fotografia do plano antes do acompanhamento do realizado ou de um replanejamento.

A interface de Planejamento recebeu a área **Baseline do cronograma**, com formulário de captura e histórico dos baselines existentes. A captura é bloqueada quando a obra não possui atividades.

Foram criadas as tabelas `schedule_baselines` e `schedule_baseline_items`. A migração `0017_light_war_machine.sql` será aplicada pelo comando de deploy `pnpm db:push`.

## Arquivos principais

| Arquivo | Alteração |
|---|---|
| `drizzle/schema.ts` | Tabelas de baseline e itens congelados. |
| `drizzle/0017_light_war_machine.sql` | Migração da Etapa 7. |
| `server/routers.ts` | Listagem e captura protegida de baseline. |
| `client/src/pages/Home.tsx` | Gantt calculado exibido junto do planejamento. |
| `client/src/components/PlanningView.tsx` | Histórico e captura de baseline. |
| `client/src/index.css` | Estilos do formulário de baseline. |

## Validação

A etapa passou em `pnpm check`, `pnpm test --run`, `pnpm build` e `git diff --check`. O TypeScript passou. A suíte possui 16 arquivos e 66 testes aprovados. O build de produção foi concluído. O aviso de chunks maiores que 500 kB continua registrado como tarefa futura de performance.

## O que ainda falta

O baseline já é capturado e preservado, mas ainda falta uma comparação visual entre baseline e plano atual. O próximo passo deverá mostrar variação de início, término e duração por atividade, além de destacar atividades adiantadas e atrasadas.

A Linha de Balanço ainda trabalha com o ritmo planejado relativo. Falta alimentá-la com medições reais por período e frente de serviço, além de calcular avanço físico acumulado, desvio e tendência de término.

O Gantt ainda trabalha com dias relativos. Falta usar calendários de trabalho, feriados, data planejada real e disponibilidade de equipes para converter os offsets em datas operacionais completas.

## Próxima etapa

A Etapa 8 será **Medição, avanço físico e controle planejado versus realizado**. Ela deverá conectar lançamentos de produção e medições ao cronograma, calcular avanço físico, comparar baseline com realizado e alimentar indicadores de prazo e produtividade.

## Commit

A entrega será versionada no GitHub com a mensagem `feat: add gantt baseline and line of balance`.

## Referências

[1]: ./PLANO-MESTRE-CONTROLE-OBRAS.md "Plano mestre de domínio e controle de obras"

[2]: ./ETAPA-06-CPM-CAMINHO-CRITICO.md "Etapa 6 — CPM e caminho crítico"
