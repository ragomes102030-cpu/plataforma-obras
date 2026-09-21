# Etapa 5 — Planejamento físico, recursos e rede de precedências

**Data:** 21 de setembro de 2026  
**Status:** concluída  
**Objetivo:** transformar o cronograma em uma base operacional de atividades, recursos, produtividade e relações de precedência.

## O que foi concluído

As atividades do cronograma agora podem registrar quantidade planejada, produtividade e vínculo opcional com um item do orçamento. A duração pode ser informada diretamente ou calculada pela relação entre quantidade e produtividade.

Foi criado o cadastro de recursos de planejamento. Cada recurso possui nome, tipo, unidade, capacidade diária, custo diário e estado ativo. Os tipos disponíveis são mão de obra, equipamento e material.

Também foi criado o registro de alocações de recursos por atividade. A estrutura permite relacionar uma atividade a um recurso, informar quantidade alocada e registrar produtividade específica da alocação.

A plataforma recebeu operações protegidas para consultar o conjunto de atividades, dependências e recursos de uma obra. Também foram adicionadas mutações para criar recurso, criar atividade, criar precedência e alocar recurso. As validações impedem criar uma dependência da atividade para ela mesma e impedem relacionar atividades ou recursos de outra obra.

A relação inicial de precedência utiliza o tipo término-início (`FS`) e defasagem zero. O modelo continua preparado para `SS`, `FF` e `SF`, além de defasagens futuras.

A seção Cronogramas foi transformada em uma interface de Planejamento e Rede. Ela apresenta indicadores, cadastro de recursos, criação de atividades, cálculo de duração, lista de atividades e criação visual de precedências.

Foi criada a migração `0015_silky_rumiko_fujikawa.sql`. O deploy do Render executa `pnpm db:push` antes do build e aplicará a alteração no banco existente.

## Arquivos principais

| Arquivo | Alteração |
|---|---|
| `drizzle/schema.ts` | Campos quantitativos, recursos e alocações. |
| `drizzle/0015_silky_rumiko_fujikawa.sql` | Migração da Etapa 5. |
| `server/routers.ts` | Namespace `planning` com recursos, atividades e precedências. |
| `client/src/components/PlanningView.tsx` | Interface profissional do planejamento físico. |
| `client/src/pages/Home.tsx` | Integração da nova tela na seção Cronogramas. |
| `client/src/index.css` | Layout e componentes visuais da rede. |

## Validação

A etapa passou em `pnpm check`, `pnpm test --run`, `pnpm build` e `git diff --check`. O TypeScript passou. A suíte possui 16 arquivos e 66 testes aprovados. O build foi concluído. O aviso de chunks maiores que 500 kB continua registrado como item futuro de performance.

## O que ainda falta

A rede de precedências foi criada e persistida, mas o cálculo completo do caminho crítico ainda não está conectado à tela. O algoritmo CPM existente deverá consumir essas relações e marcar automaticamente atividades críticas, folgas e datas calculadas.

Ainda falta distribuir atividades por frente, equipe e calendário. O recurso pode ser cadastrado e alocado, mas a alocação ainda não recalcula automaticamente produtividade, custo planejado ou duração.

Também falta gerar atividades automaticamente a partir dos serviços do orçamento e da EAP. Nesta entrega, a criação manual foi priorizada para validar o fluxo operacional e evitar uma criação automática sem confirmação do usuário.

## Próxima etapa

A Etapa 6 será **CPM, caminho crítico e cronograma calculado**. Ela deverá calcular datas, folgas, atividades críticas, impactos de defasagem e inconsistências de rede. Em seguida, o resultado poderá alimentar Gantt, Linha de Balanço e indicadores de avanço físico.

## Commit

A entrega será versionada no GitHub com a mensagem `feat: add physical planning resources and network`.

## Referências

[1]: ./PLANO-MESTRE-CONTROLE-OBRAS.md "Plano mestre de domínio e controle de obras"

[2]: ./ETAPA-04-COMPOSICAO-E-PLANEJAMENTO-QUANTITATIVO.md "Etapa 4 — Composição e planejamento quantitativo"
