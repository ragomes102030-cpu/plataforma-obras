# Planejamento de obra orientado por atividades e prazo

## Intenção

Permitir que uma equipe crie uma obra sem orçamento, estruture a EAP e as
atividades, calcule uma programação coerente, congele a referência de prazo e
atualize o que acontece no campo. O sistema deve continuar útil quando ainda
não existem preço, medição contratual, peso físico aprovado ou unidades para
Linha de Balanço.

O produto passa a tratar planejamento de prazo como um fluxo de primeira classe.
Orçamento, avanço físico agregado, medição contratual e Linha de Balanço são
módulos relacionados, com prontidões próprias. Nenhum deles deve simular que o
cronograma está completo quando não está, nem impedir o registro do andamento
do cronograma quando sua própria base está válida.

## Usuário e problema

O engenheiro ou planejador precisa começar por uma obra, decompor o escopo em
atividades, sequenciá-las e informar periodicamente o que começou, terminou,
atrasou ou teve sua previsão revista. Hoje, alguns avisos de preço, medição ou
unidade física aparecem como barreira geral, embora não sejam necessários para
montar ou atualizar um cronograma.

## Fluxo principal

1. **Criar a obra:** registrar nome, local, descrição e, quando conhecida, a
   data planejada de início. A obra nasce em rascunho. Não recebe prazo final
   fictício nem prazo de 180 dias como se fosse uma estimativa aprovada.
2. **Estruturar o trabalho:** revisar ou montar EAP e converter pacotes em
   atividades. Atividade possui identidade própria, nome, duração planejada,
   calendário e relações de precedência. Quantidade, produtividade, preço,
   unidade física e local repetitivo são opcionais.
3. **Programar:** informar a data de início quando necessário, validar a rede,
   calcular CPM e revisar início/fim previstos, folga, caminho crítico e alertas.
   O término do projeto é derivado do cronograma calculado, não digitado como
   substituto da rede.
4. **Congelar o plano de prazo:** após revisão, aprovar uma baseline de
   cronograma. Ela congela datas e durações da programação vigente. Não exige
   aprovação de orçamento.
5. **Atualizar a obra:** em cada data de posição, informar estado da atividade,
   início real, término real ou duração restante/previsão de término, e uma
   observação. O histórico é append-only e identifica autor e data. Quantidade
   executada é lançada em fluxo próprio quando houver medição física.
6. **Reprogramar com rastreabilidade:** alteração de duração ou dependência
   invalida o CPM atual e sinaliza o desvio contra a baseline. O usuário recalcula
   o cronograma e decide se cria/revisa a baseline por uma ação explícita.

## Semântica dos indicadores

Cada indicador deve dizer o que mede e de qual fonte vem:

- **Programação de prazo:** datas calculadas pelo CPM e calendário da obra.
- **Desvio de prazo:** diferença entre previsão atual e baseline aprovada. Sem
  baseline, exibir “comparação indisponível”; ainda é possível planejar e
  registrar atualizações.
- **Estado e previsão da atividade:** relato datado de campo, não inferido de
  quantidade ou custo.
- **Avanço físico:** calculado por quantidade medida, etapas ponderadas ou
  percentual físico declarado com critério e evidência. A unidade e o método
  ficam visíveis. Não usar duração transcorrida como avanço físico.
- **Avanço financeiro / valor agregado:** continua condicionado a orçamento
  aprovado, custos e respectivas evidências. Não é requisito do modo de prazo.
- **Curva de prazo:** se apresentada, compara datas/atividade planejadas e
  status registrados. Deve declarar se a série usa duração planejada ponderada
  ou avanço físico reportado. Nunca rotular duração transcorrida como avanço
  físico nem como valor agregado.
- **Linha de Balanço:** só aplica às atividades repetitivas com locais/unidades
  operacionais válidos. Atividade não repetitiva pode ser marcada “fora da LOB,
  aplicabilidade justificada”; unidade ausente afeta a LOB, não o cronograma.

## Prontidões independentes

O contrato de prontidão deve separar pelo menos estes resultados:

| Domínio | O que permite | O que pode bloqueá-lo |
| --- | --- | --- |
| Estruturação do cronograma | Criar EAP, atividades e lógica | Escopo/EAP inválidos ou atividade sem duração declarada |
| Cálculo da programação | Datas, folgas e caminho crítico | Início sem âncora de data, dependências inválidas, ciclo ou CPM desatualizado |
| Acompanhamento de prazo | Registrar atualizações datadas e mostrar estado | Atividade/versão operacional não identificável ou campos inválidos |
| Comparação com plano | Desvios contra uma referência congelada | Baseline inexistente ou desatualizada; não impede registrar andamento |
| Avanço físico agregado | Consolidar o progresso físico | Falta de método/peso físico aprovado ou lançamentos confirmados |
| Financeiro | Orçamento, medição, EVM e curva financeira | Requisitos próprios de preço, quantidade, aprovação e custos reais |
| Linha de Balanço | Fluxo repetitivo por unidade física | Atividade aplicável sem local/unidade ou parcelas inconsistentes |

Uma pendência deve aparecer no domínio correto, com ação que abre a tela
correspondente. Não deve haver um único `primeiraBarreira` capaz de bloquear
todos os módulos sem considerar o contexto.

## Modelo de atualização temporal

Uma atualização de atividade registra, no mínimo:

- atividade, versão do plano e data de posição;
- estado: não iniciada, em andamento, concluída ou bloqueada;
- data real de início e, quando concluída, data real de término;
- para atividade em andamento, duração restante estimada ou previsão de
  término, com indicação de que é uma previsão;
- nota de campo, autor e instante de registro;
- referência opcional a evidência/anexo.

Cada atualização é histórica; uma correção gera novo evento que identifica o
registro corrigido. A leitura atual usa o evento vigente mais recente, mas a
linha do tempo continua consultável. O apontamento pode ser feito na versão
operacional aprovada: a aprovação congela os campos planejados, não os fatos de
execução. Versões históricas substituídas ficam somente para consulta. Esse
fluxo não cria `production_entries`, quantidade, medição contratual ou custo.
Uma atualização sem medição continua válida para acompanhamento de prazo,
mesmo que o CPM esteja desatualizado; nesse caso, a comparação de datas é que
fica indisponível até recalcular.

## Experiência do usuário

- A Dashboard apresenta uma visão **Prazo** como padrão: término previsto,
  variação contra baseline quando disponível, caminho crítico, atrasadas,
  próximas atividades, última atualização e atividades sem atualização recente.
- A tela Cronograma mantém grade, Gantt e inspetor com uma única população de
  atividades. Um comando “Atualizar andamento” pede data de posição, estado e
  campos pertinentes ao estado selecionado.
- Uma atividade em andamento pede início real e previsão/duração restante; uma
  concluída pede início/término reais; uma bloqueada pede motivo. Não obrigar a
  preencher unidade ou custo.
- Atividades sem local físico aparecem como “local não definido” ou “não se
  aplica à LOB”, nunca como erro geral de planejamento.
- Orçamento e físico permanecem visíveis como domínios opcionais com seus
  indicadores e pendências. Não exibir cartões financeiros vazios como se
  fossem falhas do cronograma.

## Início e término do projeto

O sistema não deve adivinhar datas. Uma obra pode ser criada e estruturada sem
uma data de início definida. CPM com datas civis, baseline e comparação de
prazo exigem uma âncora explícita escolhida pelo usuário. Enquanto ela faltar,
é possível revisar EAP, durações e relações em dias relativos; o sistema informa
que a programação civil ainda depende da data inicial. O término do projeto é
calculado pelo CPM após a âncora existir.

Datas já gravadas em obras existentes permanecem intactas durante a migração.
Dados de demonstração existentes continuam marcados como exemplo e nunca viram
medição real.

## Não objetivos

- Reescrever a plataforma, o CPM ou o motor de EAP.
- Exigir preços para planejar duração e precedências.
- Inventar duração, produtividade, quantidade, peso ou data.
- Converter automaticamente tempo transcorrido em avanço físico.
- Remover orçamento, medição, EVM ou Linha de Balanço; esses módulos mantêm
  seus gates próprios.
- Alterar a obra 26 ou criar/editar versões de orçamento como parte desta
  evolução de produto.

## Critérios de aceite do produto

1. Uma obra nova pode ser criada sem orçamento e sem prazo final presumido.
2. O usuário consegue cadastrar EAP, atividades com duração manual identificada
   e dependências sem quantidade, preço, peso físico ou pavimentos.
3. O sistema calcula a programação em datas após o usuário fornecer a âncora e
   valida a rede antes de exibir CPM como atual.
4. O usuário consegue aprovar baseline de prazo sem baseline financeira.
5. O usuário consegue registrar início, progresso de prazo, bloqueio e conclusão
   com histórico datado sem lançar produção nem custo.
6. O sistema distingue previsão de prazo, avanço físico, financeiro e LOB em
   textos, cards e gates.
7. A Dashboard indica com precisão o que está calculável e o que falta para
   cada domínio, sem um aviso de preço/unidade ocultar o acompanhamento de
   cronograma.
8. Atualizações e linhas do tempo são isoladas por obra, atividade e versão.

## Pesquisa de referência

O modelo usa a distinção de Primavera P6 entre percentual por unidades,
duração e avanço físico; seus passos ponderados são úteis para entregáveis sem
uma unidade física homogênea. Dependências de atividade e baseline congelada
também são conceitos centrais em ferramentas maduras de cronograma. O EVM
continua sendo um método financeiro, não um requisito para acompanhamento de
prazo.

- [Oracle P6: tipos de percentual completo](https://docs.oracle.com/cd/G18296_01/client_help/it_IT/define_activity_percent_complete_types.htm)
- [Oracle P6: etapas ponderadas da atividade](https://docs.oracle.com/cd/E80480_01/English/User_Guides/p6_pro_user/activity_steps.htm)
- [Oracle: relações entre atividades](https://docs.oracle.com/cd/E80480_01/English/user_guides/schedule_management_user_guide/90707.htm?source=%3Aow%3Ams%3Apt%3A%3A)
- [Oracle: baseline como programação corrente](https://docs.oracle.com/cd/E80480_01/English/user_guides/schedule_management_user_guide/178411.htm?source=%3Aso%3Atw%3Aor%3Aawr%3Aodv%3A%3A)
- [PMI: Earned Value Management](https://www.pmi.org/learning/library/make-earned-value-work-project-6001)
