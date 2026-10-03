# Skill — Visualização de Planejamento
Modo: independente

## Objetivo
Escolher a representação adequada para cada informação de engenharia sem alterar o significado dos dados.

## Representações
- árvore EAP;
- tabela/dicionário;
- Gantt;
- caminho crítico;
- curva S;
- físico-financeiro;
- planejado × realizado;
- matriz de riscos;
- mapa de restrições;
- dashboard executivo;
- visão do engenheiro;
- visão de campo;
- visão do cliente.

## Regras de fidelidade
- A tela deve mostrar a versão de plano que realmente está sendo usada pelo coordenador.
- Se houver EAP aprovada e versão de trabalho, deixar o estado/versionamento inequívoco.
- Um bloqueio estrutural só pode ser exibido como estrutural se o gate correspondente tiver falhado.
- Bloqueios de dados faltantes devem mostrar a lacuna concreta, por exemplo duração ausente.
- Não converter 0, null ou ausência em valor implícito.
- Não esconder interfaces, warnings ou lacunas para produzir uma aparência de EAP "completa".
- Quando a validação da interface usar uma projeção, essa projeção deve conter o mesmo contrato necessário para a validação determinística.

## Regra
Visualização não cria dados. Deve refletir exclusivamente dados validados, indicar ausência de informação relevante e preservar status, versão, warnings e blockers reais.
