# CONTINUAÇÃO E PONTO DE RESTAURAÇÃO — ARQUIMEDES
Data: 2026-10-07
Repositório: ragomes102030-cpu/plataforma-obras

## REGRA PRINCIPAL
Não apagar, resetar, rebasear ou sobrescrever trabalho validado sem criar antes outro checkpoint. Toda continuação deve partir de um SHA explicitamente registrado aqui.

## CHECKPOINT DE RESTAURAÇÃO
- Branch de restauração: checkpoint/arquimedes-2026-10-07-ba5d2e85
- SHA protegido: ba5d2e85d152e3c4e675bd59a3ea2126020140cf
- Mensagem: test: update orchestrator tool catalog expectation
- Este checkpoint continua válido mesmo após novas correções neste documento.

## ESTADO VERIFICADO GITHUB × RENDER
- Render live verificado: 8f846cc59512a058be713dfa6880839ba094d8fc
- Mensagem live: fix: excluir atividades exemplo do CPM e baseline
- Render: plataforma-obras-api / https://plataforma-obras-api.onrender.com
- Deploy live: dep-db39a47lot8c73f1su10
- Branch configurada no Render: develop
- Auto deploy: não
- Comparação exata live → checkpoint develop/ba5d2e85:
  - ahead_by: 7
  - behind_by: 0
  - total_commits: 7
  - merge base: o próprio SHA live
- Portanto, o checkpoint ba5d2e85 contém exatamente 7 commits posteriores ao código atualmente live no Render. Não há commits do checkpoint ausentes no live e depois presentes novamente no passado; o delta é linear e controlado.

## ESTADO DO PR #65
- PR: #65
- Título: fix: invalidate CPM when schedule inputs change
- Estado: aberto, não merged
- Base: main @ 38ea69392ca32f9092192934a05910ef41e2d580
- Head: develop @ ba5d2e85d152e3c4e675bd59a3ea2126020140cf
- Não fazer merge cego do PR inteiro.
- O PR contém histórico amplo; o próximo trabalho deve transportar apenas mudanças comprovadamente necessárias para produção.

## DELTA LIVE → CHECKPOINT
A comparação GitHub confirmou que os 7 commits posteriores ao live alteram somente:
- server/activity-update-regression.test.ts
- server/orchestrator.test.ts
- server/orchestrator.ts
- server/routers.ts

Resumo do delta:
- activity-update-regression.test.ts: 0 adições / 2 remoções
- orchestrator.test.ts: 2 adições / 2 remoções
- orchestrator.ts: 16 adições / 2 remoções
- routers.ts: 3 adições / 3 remoções

Essas mudanças são pequenas e concentradas em contratos/tipos/testes. Foram verificadas em CI no checkpoint, com validate e aurora-eap verdes.

## O QUE JÁ FOI VALIDADO — NÃO REFAZER SEM MOTIVO
Aurora:
- 53 atividades operacionais
- 53 WBS distintos
- 64 dependências FS após revisão semântica
- CPM: 330 dias relativos
- 19 atividades críticas
- atividade QA 142 removida
- 0 blockers conhecidos
- Gantt/LOB renderizados em validação Browser Use
- regressões documentadas para contagem de atividades, dependências e CPM

Correções já validadas:
- rastreabilidade da atividade
- edição de atividades
- invalidação/auditoria do CPM
- exclusão de atividades exemplo do CPM/baseline
- proteção contra contaminação por atividades QA
- fechamento da rastreabilidade atividade → EAP/auditoria
- criação de atividade + auditoria atômicas

## CONTRATO DE FRESCOR DO CPM
O comportamento esperado é:
1. alteração de entrada relevante do cronograma invalida o CPM persistido;
2. o timestamp anterior deve permanecer disponível para auditoria;
3. campos calculados não podem ser tratados como atuais após alteração;
4. nova programação deve ocorrer antes de confiar novamente em ES/EF/LS/LF/folgas/crítico;
5. a invalidação deve ser coberta por teste automatizado e por teste mutável de interface.

Foi identificado anteriormente o commit de referência:
- fa03f2dc707611f67907cb3430a0d4f63b37105f
- mensagem: fix: editar atividades e invalidar cpm com auditoria

E seu teste:
- a51ae5d1bc13df7608e8c9c807fa14e0fc5042ab
- mensagem: test: proteger edição de atividades e invalidação do cpm

Não transportar esses commits por SHA isolado sem antes verificar a árvore atual e as dependências de arquivos.

## PROCEDIMENTO OBRIGATÓRIO PARA CONTINUAÇÃO
1. Preservar este checkpoint.
2. Antes de qualquer merge, comparar GitHub e Render novamente.
3. Identificar o menor patch funcional necessário.
4. Criar branch limpa a partir da base de produção escolhida.
5. Transportar somente o patch necessário, sem rebase destrutivo.
6. Rodar CI completo.
7. Fazer deploy controlado.
8. Testar a interface real com Playwright/Browser Use.
9. Fazer teste mutável somente em obra QA, nunca em produção sem intenção explícita.
10. Após alteração, revalidar o invariável Aurora: 53 atividades / 64 FS / 330 dias / 19 críticas.
11. Registrar SHA, diff, CI, deploy e resultado neste documento.
12. Se houver divergência entre GitHub, Render e banco, não adivinhar: criar novo checkpoint e investigar.

## RESTAURAÇÃO
Para recuperar exatamente o estado protegido:
- branch: checkpoint/arquimedes-2026-10-07-ba5d2e85
- SHA: ba5d2e85d152e3c4e675bd59a3ea2126020140cf

## PRINCÍPIO DE CONTINUIDADE
"Não corrigir o que já foi validado. Não substituir histórico por suposição. Toda nova mudança precisa ter SHA, diff, teste e resultado registrados."
