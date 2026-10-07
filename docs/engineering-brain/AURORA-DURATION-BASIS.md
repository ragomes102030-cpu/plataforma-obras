# Aurora — Base técnica das durações

## Estado verificado em 2026-10-06

Obra: EDIFICIO AURORA TESTE
Projeto: 6
Versão de planejamento: 2 / versão 1
Status da versão: draft

### Auditoria

Existem 53 atividades. A auditoria encontrou 0 itens de orçamento, 0 alocações de recursos, 0 registros de produção, 0 equipes de produção, 0 recursos de planejamento e 0 calendários de trabalho.

Todas as 53 atividades estão sem quantidade planejada, produtividade e vínculo orçamentário. As durações atuais são, portanto, estimativas iniciais e não durações de engenharia validadas.

## Regra técnica

O Arquimedes não deve substituir automaticamente essas durações por números de uma tabela.

Para atividades produtivas, a base preferencial é: quantidade → unidade → produtividade → equipe/recursos → calendário → duração → rede CPM.

A fórmula determinística somente será aplicada quando quantidade e produtividade forem compatíveis em unidade e semântica: duração = teto(quantidade / produtividade efetiva).

Produtividade efetiva deve considerar equipe, recurso e condições de execução quando esses dados estiverem disponíveis.

## Fontes

- SINAPI/CAIXA: composições, coeficientes, cadernos técnicos e documentação metodológica.
- SEINFRA-CE: composições e insumos da Tabela 028.1.
- SICRO/DNIT: referência adicional para infraestrutura, terraplenagem e pavimentação aplicáveis.
- Histórico real da obra: fonte preferencial quando houver produtividade observada.
- Premissa do engenheiro: pode estabelecer ou ajustar a duração, desde que registrada.
- Calendário e restrições reais: necessários para transformar estimativa em planejamento aprovado.

## Não-invenção

Sem quantidade, produtividade, equipe, calendário ou fonte aplicável, o Arquimedes deve informar a lacuna, manter a duração como estimativa e não apresentar um número arbitrário como correto.

## Aurora como caso de aprendizagem

Cada alteração futura deve registrar valor anterior, valor proposto, método, dados de entrada, fonte, premissa, cálculo, resultado, evidência, decisão do engenheiro, efeito no CPM e regressão.

Uma duração somente poderá ser considerada validada quando houver base suficiente e/ou validação explícita do engenheiro.

O CPM de 303 dias anteriormente obtido é apenas o resultado determinístico da rede sobre as durações existentes. Não constitui previsão realista ou aprovada da duração da obra.