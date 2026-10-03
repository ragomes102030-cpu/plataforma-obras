# Aurora Teste — Proposta de Atividades

## Identificação
- Obra: OB-PUPOCN — AURORA TESTE
- Projeto interno: 7
- Etapa: ATIVIDADES_PROPOSTA
- EAP aprovada usada como base: versão 2
- Nova versão de trabalho criada para atividades: versão 3
- Folhas da EAP: 53
- Atividades propostas criadas: 53
- Dependências: 0
- CPM: não executado
- Duração planejada: 0 em todas as atividades
- Alteração da versão aprovada: não

## Decisão de engenharia
Cada folha terminal da EAP aprovada foi convertida em uma atividade correspondente na nova versão de trabalho.

A atividade herda somente evidências já existentes na EAP: código EAP; referência EAP; nome; nó EAP vinculado; unidade/quantidade somente se já existentes; localização somente se já existente; fase derivada do pai da EAP.

Não foram inventados: duração; produtividade; início real ou planejado; quantidade; unidade; dependência; calendário; restrição contratual.

### Regra aplicada
durationDays = 0 significa dado faltante, e não atividade de duração zero.
Por isso a Aurora permanece em ATIVIDADES_PROPOSTA e não pode avançar para DEPENDENCIAS_PROPOSTA até que cada atividade tenha início e duração fundamentados.

## Resultado funcional observado
O runner controlado executou no Render e registrou:
- eapLeaves: 53
- activitiesExistingBefore: 0
- activitiesCreated: 53
- totalActivities: 53
- activitiesPlanned: 0
- stage: ATIVIDADES_PROPOSTA
- blocker: duration_missing

O resultado foi observado no log da aplicação em 2026-10-03.

## Furo de versionamento encontrado
Durante a execução, a rotina de fechamento da EAP havia sido executada novamente depois da primeira aprovação. Isso produziu uma nova versão aprovada antes da criação da versão de atividades.

Estado observado:
- versão 1: aprovação anterior;
- versão 2: nova aprovação da EAP após repetição do fechamento;
- versão 3: versão de trabalho criada para atividades.

A função de aprovação atualmente não marcava automaticamente as versões aprovadas anteriores como superseded. Isso permite mais de uma versão com status approved.

### Correção necessária
Ao aprovar uma nova versão: manter a versão atual como approved; marcar as versões anteriores aprovadas do mesmo projeto como superseded; preservar o histórico/auditoria; nunca apagar a versão anterior.

Essa correção é de governança de baseline e deve entrar no fluxo geral, não somente na Aurora.

## Próximo bloqueio legítimo
Antes de propor dependências, o sistema precisa obter evidência para início planejado e duração planejada de cada atividade.
Somente depois disso devem ser propostos predecessores e sucessores.

A Aurora continua sendo uma obra exclusivamente de teste. Todos os achados acima devem ser tratados como evidência para evolução do Arquimedes e, quando generalizáveis, convertidos em regressões no QA.