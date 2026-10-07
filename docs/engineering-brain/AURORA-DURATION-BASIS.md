# Aurora — Base técnica das durações

## Estado verificado em 2026-10-06

Obra: EDIFICIO AURORA TESTE
Projeto: 6
Versão de planejamento: 2 / versão 1
Status da versão: draft

### Resultado da auditoria

A versão possui 53 atividades. A auditoria encontrou:
- 0 itens de orçamento vinculados;
- 0 alocações de recursos;
- 0 registros de produção;
- 0 equipes de produção;
- 0 recursos de planejamento;
- 0 calendários de trabalho cadastrados;
- 53 atividades sem quantidade planejada;
- 53 atividades sem produtividade;
- 53 atividades sem vínculo orçamentário.

Portanto, as durações atuais são estimativas iniciais de planejamento, não durações de engenharia validadas.

## Regra adotada

O Arquimedes não deve substituir automaticamente essas durações por números obtidos de uma tabela de referência.

Para atividades produtivas, a base preferencial será:

quantidade → unidade → produtividade → equipe/recursos → calendário → duração → rede CPM

A fórmula determinística somente será aplicada quando quantidade e produtividade forem compatíveis em unidade e semântica. Em termos gerais: duração = teto(quantidade / produtividade efetiva).

A produtividade efetiva deve considerar equipe, recurso e condições de execução quando esses dados estiverem disponíveis.

## Fontes de referência

- SINAPI/CAIXA: composições, coeficientes, cadernos técnicos e documentação metodológica.
- SEINFRA-CE: composições e insumos da Tabela 028.1, relevantes para o contexto regional do Ceará.
- SICRO/DNIT: referência adicional para serviços de infraestrutura, terraplenagem e pavimentação aplicáveis.
- Histórico real da obra: fonte preferencial quando houver produtividade observada.
- Premissa do engenheiro: pode estabelecer ou ajustar a duração, mas deve ficar registrada como premissa.
- Calendário e restrições reais do empreendimento: necessários antes de considerar a duração como planejamento aprovado.

## Não-invenção

Se quantidade, produtividade, equipe, calendário ou fonte aplicável não estiverem disponíveis, o Arquimedes deve:
1. informar a lacuna;
2. manter a duração como estimativa;
3. explicar por que não pode transformá-la em duração calculada;
4. pedir ou buscar o dado faltante quando necessário;
5. não apresentar uma duração arbitrária como correta.

## Aurora como caso de aprendizagem

A Aurora será usada como primeiro caso de aprendizagem para o motor de durações.

Cada alteração futura deve registrar: valor anterior; valor proposto; método; dados de entrada; fonte; premissa; cálculo; resultado; confiança/evidência; decisão do engenheiro; efeito no CPM; regressão correspondente.

### Critério para aprovação

A duração somente poderá ser considerada validada quando houver base suficiente e/ou validação explícita do engenheiro.

O CPM de 303 dias anteriormente obtido representa somente o resultado determinístico da rede sobre as durações existentes. Não constitui, por si só, uma previsão realista ou aprovada da duração da obra.