# Planejamento por serviços sem orçamento

**Objetivo:** deixar explícito que uma obra nova pode ser programada e acompanhada por serviços e prazo sem orçamento; custos continuam disponíveis como ramo opcional.

**Abordagem escolhida:** preservar o fluxo já implementado EAP → atividades e durações → dependências → CPM → baseline → atualizações de campo. Alinhar a página inicial, a criação da obra e o Escopo a esse fluxo. Manter quantidades como entrada para medição da produção, localização repetitiva como requisito específico da Linha de Balanço e orçamento como requisito exclusivo dos indicadores financeiros.

**Alternativas consideradas:** exigir orçamento antes do CPM (contraria o objetivo e o código já permite baseline sem preço); remover módulos financeiros (desnecessário, pois custos continuam úteis quando solicitados); tornar o planejamento por serviços o caminho principal, mantendo os módulos financeiros separados (escolhido).

**Restrições:** não criar versão de orçamento ou cronograma na obra 26; não gravar produção sintética nem inventar locais/dados de execução; validar o que é possível ao vivo pela interface; preservar o vínculo da baseline e dados existentes.

## Tarefas

1. [x] Criar testes de regressão para a linguagem da página inicial, do cadastro de nova obra e do Escopo: orçamento opcional, serviços/duração/rede como caminho do prazo.
2. [x] Ajustar os textos dessas telas; manter a Curva S explicitamente financeira e a Linha de Balanço condicionada à localização repetitiva confirmada.
3. [x] Executar testes focalizados, `pnpm check`, suíte e build. Publicação e validação ao vivo permanecem pendentes até a conclusão do deploy.

## Critérios de aceite

- O engenheiro vê em sua primeira visita como iniciar pelo escopo e pelos serviços.
- A obra pode calcular CPM e registrar baseline sem orçamento.
- A interface diferencia medição física por serviço, Linha de Balanço e controles financeiros.
- Ausência de relato de campo continua exibida como sem dado, sem ser convertida em execução zero.
