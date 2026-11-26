# Fluxo de planejamento claro por serviços

## Intenção

Um engenheiro que abre uma obra pela primeira vez deve entender que o caminho
principal começa pelos serviços da EAP, passa por duração e sequência, produz
CPM e baseline de prazo, e termina no acompanhamento de campo. Orçamento,
preço e Curva S financeira são opcionais e não entram como bloqueio nesse fluxo.

## Estado atual

O produto já mantém EAP versionada, atividades, dependências, CPM nativo,
baseline congelada e histórico temporal por atividade. O engenheiro consegue
registrar início real, duração restante/previsão, conclusão ou bloqueio.

Dois pontos ainda confundem o primeiro uso e a operação: a Dashboard não ensina
essa sequência em uma trilha única; e relatos de campo não recalculam uma
previsão geral do término. O resumo de relatos e o término atual do CPM aparecem
como informações separadas.

## Abordagens consideradas

1. **Somente texto de ajuda:** barato, mas deixa os avisos e o cronograma sem
   uma sequência de ação clara e não resolve a previsão depois das atualizações.
2. **Trilha por serviços + previsão de campo calculada:** reutiliza EAP, CPM,
   calendário, baseline e eventos existentes. Orienta a primeira visita e
   calcula uma projeção de término sem alterar plano aprovado, baseline,
   produção ou custo. **Escolhida**, porque entrega clareza sem criar um motor
   paralelo nem exigir orçamento.
3. **Copiar os relatos para as atividades planejadas:** faria a tela parecer
   atualizada rapidamente, mas misturaria fato de campo com plano e poderia
   mover ou invalidar a baseline. Rejeitada.

## Comportamento decidido

- A trilha tem cinco passos: serviços da EAP; duração das atividades; ordem de
  execução; data inicial, CPM e baseline; atualização dos serviços.
- Cada passo mostra estado e ação para a tela correspondente. O texto afirma que
  preço/orçamento não é necessário para programar prazo.
- Atualizações da versão atual são lidas na data de corte solicitada. Correções
  substituídas não entram na projeção.
- Atividade concluída usa o término real como marco. Atividade em andamento usa
  início do próximo dia útil a partir da data de corte e duração restante (ou a
  data de previsão convertida pelo calendário). Dependências de entrada de uma
  atividade já iniciada não podem empurrar seu início observado; essa situação
  fica sinalizada como fora de sequência.
- Atividades não iniciadas ou sem atualização conservam duração planejada e não
  podem começar antes da data de corte. A contagem sem atualização fica visível
  como cobertura incompleta, nunca como fato de execução.
- Atividade bloqueada sem estimativa de término não produz um término de obra
  confiável. O relato continua permitido e a tela pede a estimativa que falta.
- Duração restante e data de previsão são alternativas exclusivas no mesmo
  relato. Projeção é de leitura; não grava CPM, plano, baseline, produção,
  medição, orçamento ou custo.
- Sem data inicial civil ou CPM atual, a trilha continua mostrando atividades
  em D+, e a previsão civil informa exatamente o requisito ausente.
- Pesos físicos e comandos de cenário QA saem do caminho principal de
  atividades para uma seção opcional, sem remover sua funcionalidade.

## Objetivos e limites

- Guiar um engenheiro novo sem exigir explicação externa.
- Planejar e acompanhar serviços sem cadastrar preços.
- Manter plano aprovado, baseline e eventos de campo como fontes separadas.
- Não inferir avanço físico, medição ou custo de duração/status.
- Não alterar obra 26, orçamento v4, dados ao vivo, publicar ou criar versões de
  orçamento.

## Critérios de aceite

1. Um engenheiro vê a ordem de trabalho e a próxima ação sem depender de preço.
2. A previsão usa a rede CPM e o calendário da obra, incorporando atualizações
   vigentes de início real, término real e duração restante.
3. Cobertura incompleta, atividade bloqueada sem estimativa e trabalho fora de
   sequência aparecem explicitamente.
4. A previsão não altera a baseline nem o CPM/plano aprovado.
5. Duração restante e previsão incompatíveis não podem ser gravadas juntas.
6. A interface continua distinguindo prazo, avanço físico e financeiro.
