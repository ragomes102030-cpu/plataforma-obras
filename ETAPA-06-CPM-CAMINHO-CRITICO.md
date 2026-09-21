# Etapa 6 — CPM, caminho crítico e cronograma calculado

**Data:** 21 de setembro de 2026  
**Status:** concluída  
**Objetivo:** conectar o calculador CPM às atividades e precedências persistidas, calculando datas relativas, folgas e criticidade.

## O que foi concluído

O calculador CPM determinístico existente foi conectado ao namespace de planejamento. O endpoint lê as atividades e precedências da obra, valida a rede e calcula início e término antecipados, início e término tardios, folga total, duração do projeto e caminho crítico.

Quando a rede é válida, os resultados são persistidos em cada atividade. O sistema atualiza `startOffset` com o início antecipado calculado e grava os campos de datas relativas, folga, indicador crítico e instante do cálculo. A atividade crítica é aquela cuja folga total é menor ou igual a zero.

Quando a rede contém uma dependência inválida ou um ciclo, o endpoint não grava resultados parciais. Ele retorna os problemas para a interface, preservando o último resultado válido existente.

A tela de Planejamento recebeu o painel **Cronograma calculado**. O usuário pode acionar o cálculo CPM, visualizar a duração total, a quantidade de atividades críticas e a sequência do caminho crítico. A lista de atividades passou a mostrar início relativo, folga e marcação crítica quando o resultado está persistido.

A migração `0016_outgoing_tyrannus.sql` foi criada para adicionar os campos de resultado CPM em `schedule_activities`. O deploy do Render executa `pnpm db:push` antes do build e aplicará a alteração no banco existente.

## Campos persistidos

| Campo | Finalidade |
|---|---|
| `earlyStart` | Início antecipado relativo ao começo do projeto. |
| `earlyFinish` | Término antecipado relativo. |
| `lateStart` | Último início permitido sem alterar a duração do projeto. |
| `lateFinish` | Último término permitido. |
| `totalFloat` | Folga total da atividade. |
| `cpmCalculatedAt` | Momento do cálculo persistido. |
| `critical` | Indicador de atividade no caminho crítico. |

## Arquivos principais

| Arquivo | Alteração |
|---|---|
| `drizzle/schema.ts` | Campos CPM nas atividades. |
| `drizzle/0016_outgoing_tyrannus.sql` | Migração da Etapa 6. |
| `server/routers.ts` | Endpoint protegido `planning.calculateCpm`. |
| `client/src/components/PlanningView.tsx` | Painel de cálculo e exibição de resultados. |
| `client/src/index.css` | Estilos do painel CPM e atividades críticas. |

## Validação

A etapa passou em `pnpm check`, `pnpm test --run`, `pnpm build` e `git diff --check`. O TypeScript passou. A suíte existente permanece aprovada com 16 arquivos e 66 testes. O build de produção foi concluído. O aviso de chunks maiores que 500 kB continua separado como tarefa de performance.

## O que ainda falta

O cálculo atual trabalha em dias relativos. Ainda falta converter os offsets em datas de calendário usando a data planejada da obra, feriados, fins de semana e calendários específicos de equipes.

Também falta exibir a folga por atividade em uma tabela dedicada, destacar o caminho crítico no Gantt, detectar e apresentar ciclos com uma visualização orientada e calcular folga livre. O custo e a capacidade dos recursos ainda não alteram automaticamente o CPM.

A próxima evolução deverá recalcular o CPM quando uma duração, produtividade ou precedência for alterada e registrar versões do cronograma calculado para comparação entre baseline e replanejamento.

## Próxima etapa

A Etapa 7 será **Gantt calculado, baseline e linha de balanço**. Ela deverá transformar os resultados CPM em datas visíveis, comparar baseline com replanejamento e preparar indicadores físicos por período e frente de serviço.

## Commit

A entrega será versionada no GitHub com a mensagem `feat: calculate cpm and critical path`.

## Referências

[1]: ./PLANO-MESTRE-CONTROLE-OBRAS.md "Plano mestre de domínio e controle de obras"

[2]: ./ETAPA-05-PLANEJAMENTO-RECURSOS-E-REDE.md "Etapa 5 — Planejamento, recursos e rede"
