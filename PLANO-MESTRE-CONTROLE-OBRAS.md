# Plano mestre de domínio — Plataforma Obras

**Data:** 21 de setembro de 2026  
**Base:** código atual da Plataforma Obras, plano de continuação e roadmap funcional já existente.

## Conclusão

A avaliação do usuário está correta. A Plataforma Obras possui uma fundação técnica útil, mas ainda não é um sistema completo de planejamento e controle de obras. Ela contém EAP, atividades, dependências, Gantt, produção básica, restrições, relatórios resumidos e integrações MCP. Entretanto, esses elementos ainda não formam um fluxo gerencial integrado.

O sistema atual ainda não domina o conjunto de processos que precisa sustentar: orçamento, composição de serviços, planejamento físico, frentes de serviço, rede de precedências, caminho crítico, recursos, produção, medição, controle planejado versus realizado, indicadores e gráficos de decisão. A navegação apresenta alguns desses nomes, mas a profundidade operacional ainda é desigual. O próximo objetivo não deve ser criar mais cartões. Deve ser construir um modelo de dados coerente e permitir que uma obra percorra o ciclo completo do orçamento ao controle.

## Diagnóstico atual por domínio

| Domínio | Situação atual | O que falta para ser operacional |
|---|---|---|
| Orçamento | Não há módulo de orçamento persistido. | Serviços, quantitativos, preços unitários, custos diretos e indiretos, encargos, BDI, versões e aprovação. |
| Serviços e composições | Existem atividades e unidades de produção, mas não uma composição de serviço. | Insumos, mão de obra, equipamentos, coeficientes, produtividade, custo unitário e vínculo com a EAP. |
| Planejamento | Há EAP, atividades, dependências e Gantt. | Calendário, quantitativos planejados, duração derivada de produtividade, marcos, restrições e baseline. |
| Frentes | Há cadastro simples de frentes. | Alocação de equipes, serviços executados, capacidade, localização e histórico diário. |
| Rede de precedências | Há dependências persistidas e validador. | Editor visual, validação explicada, folgas, caminho crítico, marcos e impacto de alterações. |
| Recursos | Há equipes e unidades, sem planejamento de recursos. | Pessoas, equipamentos, materiais, disponibilidade, alocação e conflito de capacidade. |
| Produção | Há lançamento básico de produção. | Diário de obra, aprovação, correção controlada, produtividade, saldo e vínculo com serviço/frente/equipe. |
| Medição | Não existe medição contratual consolidada. | Períodos, boletins, itens medidos, memória de cálculo, aprovação e acumulado. |
| Planejado versus realizado | Existem dados separados, sem controle integrado. | Curvas acumuladas, avanço físico, custo realizado, prazo, variações e previsão de término. |
| Indicadores | Existem contagens resumidas. | Indicadores rastreáveis de prazo, custo, produtividade, qualidade, restrições e risco. |
| Gráficos | Há Gantt e uma visão inicial de Linha de Balanço. | Curva S, avanço físico, produtividade, recursos, medição, valor agregado e tendência. |
| Governança | A máquina de gates foi iniciada. | Versão de plano, baseline, aprovação, reabertura, auditoria e efeito das alterações. |

## Modelo funcional pretendido

A plataforma deverá tratar cada obra como um conjunto integrado de versões e períodos de controle. O orçamento define os serviços e seus custos. A EAP organiza o escopo. O planejamento distribui serviços no tempo e vincula produtividade, recursos e precedências. As frentes e equipes executam o plano. A produção e a medição registram o realizado. Os indicadores comparam planejado, realizado e tendência. A governança registra o que foi aprovado e por quem.

> **Regra central:** nenhum indicador deve ser apresentado como verdade gerencial se não for possível rastrear seu cálculo até um serviço, uma atividade, um período e uma fonte de dados persistida.

## Domínios que serão implementados

### 1. Orçamento e serviços

O orçamento deverá possuir versões, situação e aprovação. Cada orçamento terá itens de serviço com código, descrição, unidade, quantidade, preço unitário, custo total, composição e vínculo com um item da EAP. A plataforma deverá separar custo direto, custo indireto, encargos, margem e BDI, sem misturar esses conceitos no preço final.

A composição de serviço será formada por insumos, mão de obra, equipamentos e subcomposições. Cada componente terá unidade, coeficiente e custo unitário. O resultado será o custo unitário do serviço e permitirá calcular o custo planejado de uma quantidade executável.

### 2. Planejamento físico

O planejamento deverá receber os serviços orçados e transformá-los em atividades executáveis. Cada atividade terá quantidade planejada, unidade, produtividade de referência, duração, calendário, predecessoras, recurso principal, frente e período planejado.

A duração não deverá ser apenas um número digitado. Quando houver produtividade e capacidade de recurso, o sistema deverá explicar a duração calculada e permitir ajuste justificado. Alterações manuais deverão ser auditáveis.

### 3. Rede, caminho crítico e linha de balanço

A rede de precedências será a fonte do cálculo de datas, folgas e caminho crítico. O usuário deverá conseguir criar e editar relações Finish-to-Start, Start-to-Start, Finish-to-Finish e Start-to-Finish, com defasagem.

O sistema deverá explicar por que uma atividade é crítica, quais sucessoras serão afetadas por seu atraso e qual é a folga disponível. A Linha de Balanço deverá usar atividades repetitivas, frentes e localização, em vez de ser apenas uma linha decorativa.

### 4. Recursos e frentes

Recursos deverão ser classificados como mão de obra, equipamento e material. Cada recurso terá unidade de capacidade, disponibilidade por período, custo e vínculo com equipes. Uma frente representará o local ou setor de execução e poderá receber várias atividades e equipes.

O planejamento de recursos deverá mostrar sobrecarga, ociosidade, conflitos e necessidade de remanejamento. A produção realizada deverá consumir ou atualizar a capacidade planejada sem apagar o histórico original.

### 5. Produção e medição

A produção será registrada por data, obra, frente, serviço, atividade, equipe, recurso, quantidade executada e observação. O lançamento deverá passar por rascunho, revisão e confirmação. Correções posteriores deverão gerar histórico em vez de sobrescrever silenciosamente o valor anterior.

A medição será uma consolidação por período. Cada boletim deverá identificar os itens medidos, quantidade do período, acumulado anterior, acumulado atual, saldo contratual, evidências e situação de aprovação. Produção e medição poderão estar relacionadas, mas não serão tratadas como a mesma coisa.

### 6. Controle planejado versus realizado

O controle deverá comparar, no mínimo, quatro dimensões: quantidade, prazo, custo e produtividade. Para cada período, a obra deverá mostrar o planejado, o realizado, a variação e a tendência.

A plataforma deverá permitir identificar se uma variação decorre de baixa produtividade, falta de recurso, restrição, mudança de escopo, atraso de predecessora ou lançamento incompleto. O agente poderá explicar a variação, mas o cálculo deverá ser determinístico e independente do agente.

### 7. Indicadores e gráficos

Os indicadores principais serão avanço físico planejado e realizado, produção acumulada, produtividade por equipe e frente, atividades atrasadas, atividades críticas em risco, restrições vencidas, custo planejado e realizado, medição acumulada, utilização de recursos e previsão de término.

Os gráficos prioritários serão Curva S física, Curva S de custo, Gantt com baseline, Linha de Balanço, histograma de recursos, produtividade por período, planejado versus realizado e painel de variações. Cada gráfico deverá mostrar período, unidade, filtros e fonte de cálculo.

## Ordem de implementação

### Entrega 1 — Contrato de domínio e orçamento mínimo

Criar as entidades de orçamento, versões de orçamento, itens de serviço e composições básicas. Implementar cadastro, edição, cálculo de total e vínculo do serviço com a EAP. A primeira entrega deverá permitir cadastrar uma pequena planilha de serviços sem depender de MCP ou LLM.

### Entrega 2 — Planejamento quantitativo

Adicionar quantidade planejada, unidade, produtividade e vínculo entre serviço, atividade, EAP, recurso e frente. O Gantt passará a explicar a origem da duração e do custo planejado.

### Entrega 3 — Rede e CPM explicável

Criar editor de dependências, validação de ciclos, cálculo de datas, folgas e caminho crítico. A baseline deverá registrar o plano aprovado antes de qualquer alteração posterior.

### Entrega 4 — Recursos, frentes e produção controlada

Completar o cadastro de recursos e alocações. Transformar a produção em fluxo diário com aprovação, correção, produtividade e comparação com o planejamento.

### Entrega 5 — Medição e controle

Criar boletins de medição, períodos de controle, acumulados, saldos e aprovação. Consolidar planejado versus realizado por serviço, atividade, frente e período.

### Entrega 6 — Indicadores e gráficos executivos

Construir os gráficos com dados rastreáveis. O painel deverá responder quais são os desvios, por que ocorreram, qual impacto possuem e qual decisão é necessária.

### Entrega 7 — Governança e agente explicável

Relacionar decisões, gates, baseline, versões e recomendações. O agente deverá explicar o estado da obra com base em fatos persistidos e indicar lacunas sem substituir os registros operacionais.

## Critério para considerar o sistema “masterizado”

Uma obra nova deverá conseguir passar pelo seguinte fluxo sem planilhas externas obrigatórias:

1. criar o descritivo e o orçamento;
2. cadastrar serviços, quantidades, composições e preços;
3. organizar os serviços em uma EAP;
4. gerar atividades e definir produtividade;
5. distribuir as atividades por frente, equipe e período;
6. criar a rede de precedências e calcular o caminho crítico;
7. aprovar uma baseline;
8. lançar produção diária;
9. registrar e aprovar medições;
10. comparar planejado, realizado, custo e prazo;
11. analisar indicadores e gráficos;
12. registrar decisões, restrições e ações corretivas.

O sistema atual ainda não atende esse critério. A fundação técnica permite chegar lá, mas será necessário ampliar o modelo de dados e construir os fluxos de forma vertical, começando pelo orçamento e pelos serviços.

## Decisão técnica

Não recomendo migrar para desktop neste momento. O domínio pode ser construído online com o plano gratuito durante o desenvolvimento. A prioridade é criar o núcleo funcional e reduzir a dependência de telas demonstrativas. A arquitetura desktop ou offline poderá ser avaliada depois que o fluxo de orçamento, planejamento, produção e controle estiver estável.

## Referências

[1]: ./ROADMAP-CORRECOES-PRODUTO-OBRAS.md "Roadmap de correções e evolução funcional da Plataforma Obras"

[2]: /home/ubuntu/upload/Planodecontinuaçãoecorreções—PlataformaObras.md "Plano de continuação e correções da Plataforma Obras"
