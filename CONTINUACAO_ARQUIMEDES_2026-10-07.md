# CONTINUAÇÃO E PONTO DE RESTAURAÇÃO — ARQUIMEDES
Data: 2026-10-07
Repositório: ragomes102030-cpu/plataforma-obras

## REGRA PRINCIPAL
Não apagar, resetar, rebasear ou sobrescrever trabalho validado sem criar antes outro checkpoint. Toda continuação deve partir de um SHA explicitamente registrado aqui.

## CHECKPOINT DE RESTAURAÇÃO
- Branch de restauração: checkpoint/arquimedes-2026-10-07-ba5d2e85
- SHA protegido: ba5d2e85d152e3c4e675bd59a3ea2126020140cf
- Mensagem: test: update orchestrator tool catalog expectation
- Base principal naquele momento: main = 8f56dfa2883fa04f3bec103df7ee27274f71d851
- Merge base main/develop: b5517bf2d1b01e775c909fd1e3cf92e6fe62acc3

## ÚLTIMO ESTADO DO GITHUB
- main: 8f56dfa2883fa04f3bec103df7ee27274f71d851
- develop: ba5d2e85d152e3c4e675bd59a3ea2126020140cf
- develop está 1.028 commits à frente e 51 atrás de main; branches divergentes.
- PR #65: aberto, base main, head develop, 1.028 commits, 289 arquivos, mergeable_state dirty.
- NÃO fazer merge direto do PR #65.

## ÚLTIMO ESTADO LIVE NO RENDER
Serviço: plataforma-obras-api
URL: https://plataforma-obras-api.onrender.com
Branch configurada: develop
Auto deploy: não
Último deploy live verificado:
- SHA: 8f846cc59512a058be713dfa6880839ba094d8fc
- Mensagem: fix: excluir atividades exemplo do CPM e baseline
- Deploy: dep-db39a47lot8c73f1su10
- Status: live

O SHA live é ancestral de develop por 7 commits. Portanto, NÃO tratar Render live como equivalente ao HEAD de develop.

## O QUE JÁ FOI VALIDADO — NÃO REFAZER
Aurora:
- 53 atividades operacionais
- 53 WBS distintos
- 64 dependências FS após revisão semântica
- CPM: 330 dias relativos
- 19 atividades críticas
- atividade QA 142 removida
- 0 blockers conhecidos
- Gantt/LOB renderizados em validação Browser Use
- regressões documentadas para contagem de atividades, dependências e CPM.

Correções live relevantes:
- rastreabilidade da atividade
- edição de atividades
- invalidação/auditoria do CPM
- exclusão de atividades exemplo do CPM/baseline
- proteção contra contaminação por atividades QA.

## PR #65
Título: fix: invalidate CPM when schedule inputs change
Objetivo: invalidar resultado persistido do CPM quando entradas de cronograma mudarem, preservando timestamp anterior para auditoria e mantendo regressões automatizadas.

Atenção: a análise anterior concluiu corretamente que o PR inteiro é grande demais para merge direto. Porém, NÃO assumir quais commits individuais são o fix sem verificar o diff real.

## DESCOBERTA IMPORTANTE
O último deploy live é 8f846cc, e develop possui exatamente 7 commits posteriores a esse SHA. Esses 7 commits tocaram somente:
- server/activity-update-regression.test.ts
- server/orchestrator.test.ts
- server/orchestrator.ts
- server/routers.ts

Essas alterações incluem correções de tipos/contratos e testes que chegaram a CI verde. Devem ser preservadas.

## PROCEDIMENTO OBRIGATÓRIO PARA CONTINUAÇÃO
1. Trabalhar a partir de develop/ba5d2e85, nunca voltar para um SHA antigo sem motivo documentado.
2. Preservar o checkpoint acima.
3. Antes de qualquer merge, identificar exatamente os arquivos/commits do contrato de frescor do CPM.
4. Comparar esses arquivos contra main.
5. Se necessário, criar branch limpa a partir de main e transportar somente o patch necessário.
6. Não alterar banco Aurora nem recalcular dados apenas para "testar merge".
7. Rodar CI antes do merge.
8. Fazer teste de mutação real com Playwright/Browser Use somente após deploy.
9. Após qualquer alteração, revalidar o invariável Aurora: 53 atividades / 64 FS / 330 dias / 19 críticas.
10. Se houver dúvida sobre qual SHA é correto, PARAR A ALTERAÇÃO, comparar GitHub + Render e registrar a dúvida; não adivinhar.

## RESTAURAÇÃO
Para recuperar exatamente o estado protegido:
- checkout da branch checkpoint/arquimedes-2026-10-07-ba5d2e85
- SHA ba5d2e85d152e3c4e675bd59a3ea2126020140cf

Essa branch é o ponto de restauração do trabalho antes da próxima intervenção.

## PRINCÍPIO DE CONTINUIDADE
"Não corrigir o que já foi validado. Não substituir histórico por suposição. Toda nova mudança precisa ter SHA, diff, teste e resultado registrados."
