# Roadmap de correções e evolução funcional — Plataforma Obras

**Data:** 21 de setembro de 2026  
**Base analisada:** commit `0ac3647`  
**Plano de referência:** Plano de continuação e correções — Plataforma Obras

## Conclusão

A percepção de que o sistema está simplório é válida. O problema não está principalmente na quantidade de código ou na arquitetura técnica. O problema está na distância entre o **nome dos módulos apresentados na navegação** e a **profundidade das operações que o usuário consegue executar**.

Hoje a plataforma apresenta Portfólio, EAP, Cronogramas, Produção, Restrições, Relatórios, Gantt/LOB e Agente. Porém, várias dessas áreas ainda entregam uma visão parcial, uma leitura de dados ou um formulário isolado. Falta um fluxo completo que leve o coordenador da obra desde o descritivo até um plano validado, uma produção comparável ao planejado e uma decisão operacional rastreável.

A Fase 4 do plano está correta e deve ser implementada. Entretanto, **implementar somente a máquina de estados não fará o sistema parecer mais completo**. A Fase 4 precisa ser combinada com um primeiro fluxo vertical de produto: descritivo → EAP editável → atividades → dependências → CPM validado → cronograma aprovado.

A recomendação é priorizar **profundidade de um fluxo principal**, e não criar mais cartões, indicadores ou módulos de navegação.

## Diagnóstico funcional atual

### O que já é real

A base atual já possui elementos importantes:

- autenticação GitHub e usuários persistidos;
- obras persistidas no MySQL;
- EAP persistida no banco local da aplicação;
- atividades, dependências e cálculo de avanço;
- Gantt com edição de atividades;
- cadastro de frentes, equipes e unidades;
- lançamento de produção como rascunho;
- registro de restrições, decisões, achados e memórias do agente;
- execução do agente com eventos, status e tratamento de falhas;
- integração de leitura com os MCPs;
- workbenches técnicos para homologação e importação.

Isso significa que não é necessário começar novamente. Existe uma fundação suficiente para construir um produto mais robusto.

### O que causa a sensação de protótipo

A tela principal usa uma navegação ampla, mas a profundidade varia muito entre os módulos. A EAP permite carregar ou montar um plano inicial e selecionar nós, mas ainda não oferece uma edição hierárquica completa. O usuário não consegue, pela tela principal, criar um nó, alterar sua posição, mover uma subárvore, excluir um pacote ou executar uma validação estrutural com resultado detalhado.

O Cronograma permite editar alguns atributos de atividades dentro do Gantt, mas ainda não oferece um editor completo de atividades, uma tela de dependências, uma ferramenta explícita para validar ciclos, uma operação clara de recalcular o caminho crítico ou uma baseline com comparação entre planejado e realizado.

A Produção permite cadastrar uma frente, equipe, unidade e lançamento diário. Entretanto, o fluxo termina no registro como rascunho. Ainda faltam confirmação, edição, correção, fechamento do dia, produtividade, comparação com o planejado e vínculo visível entre produção, atividade, frente e avanço acumulado.

Restrições é a área mais próxima de um fluxo operacional, mas registra o achado e o mostra ao agente. Ainda não há um ciclo completo de responsável, prazo, ação, evidência, resolução, reabertura e impacto no cronograma.

Relatórios apresenta métricas resumidas. Ele não entrega ainda um relatório de decisão de obra com variação de prazo, atividades críticas, avanço planejado versus realizado, restrições vencidas, produtividade por equipe e próximos marcos.

O agente possui uma boa base de persistência, mas a experiência ainda está mais próxima de um assistente de análise do que de um coordenador que conduz a obra por gates verificáveis.

## Correções críticas antes de novas funcionalidades

### 1. Impedir que o estado avance sem validação

A rota `agent.recordDecision` registra a decisão e atualiza o estágio do projeto usando `nextStage`, mas a regra de transição ainda não é um gate verificável. Isso permite que o estado seja avançado sem que o backend prove que a condição anterior foi cumprida.

A correção deve criar um serviço único, por exemplo `transitionProjectStage`, que:

1. leia o estado atual;
2. determine a transição permitida;
3. execute os validadores do gate;
4. recuse a transição com uma lista de bloqueios quando houver falha;
5. registre decisão, autor, escopo, motivo e resultado;
6. atualize o estado somente após a validação.

O frontend não deve decidir se uma obra pode avançar. Ele deve apenas exibir o resultado do backend.

### 2. Resolver a divergência entre os estados

O plano anexado apresenta uma sequência de estados. O schema contém esses estados e também `BASELINE_PROPOSTA`. O componente operacional mantém outra lista local de etapas. Essa duplicação permite que o banco, o backend, o frontend e o documento passem a falar línguas diferentes.

Deve existir uma única definição compartilhada de estados, transições e nomes de apresentação. O frontend, as rotas, os validadores e os testes devem importar essa definição. O estado de baseline precisa ser decidido explicitamente: ou faz parte da Fase 4 com gate somente de leitura, ou fica reservado para a Fase 5. Não deve existir como etapa parcialmente implementada.

### 3. Criar a versão do plano antes de aprovar qualquer etapa

O plano determina a criação de `project_plan_versions`, mas essa tabela ainda não aparece no schema atual. Sem versão do plano, uma alteração na EAP pode modificar o mesmo conjunto de dados que foi aprovado anteriormente.

A versão deve ser criada de forma compatível com os dados existentes. O primeiro passo pode usar `versionId` nullable nas tabelas de EAP, atividades e dependências, preservando as obras atuais. Depois da migração e da associação inicial, novas alterações devem criar uma nova versão ou reabrir a versão atual segundo uma regra clara.

A aprovação deve apontar para uma versão concreta. O sistema precisa responder: “qual EAP, quais atividades e quais dependências foram aprovadas?”.

## Primeiro fluxo vertical recomendado

O produto deve ganhar profundidade nesta ordem:

```text
Descritivo da obra
        ↓
EAP editável e validada
        ↓
Atividades vinculadas à EAP
        ↓
Dependências sem ciclos
        ↓
CPM calculado e explicado
        ↓
Cronograma proposto
        ↓
Aprovação ou rejeição com gate
        ↓
Produção comparável ao planejamento
```

Esse fluxo deve ser priorizado antes de expandir o agente, o desktop ou integrações de escrita nos MCPs. Ele representa o valor central da Plataforma Obras: transformar informação de uma obra em um plano controlado e acompanhável.

## Roadmap priorizado

### P0 — tornar o planejamento utilizável

#### P0.1 — Descritivo mínimo da obra

A criação de uma obra hoje recebe principalmente nome, localização e datas. O descritivo precisa ser uma etapa real do produto, com campos mínimos que sustentem o planejamento:

- tipo de obra;
- cliente;
- área ou quantidade de referência;
- método construtivo;
- região;
- prazo contratual;
- premissas conhecidas;
- restrições iniciais;
- responsável pelo planejamento.

O gate `DESCRITIVO` deve mostrar exatamente o que falta. Não deve existir uma tela que apenas diga que a obra foi criada.

#### P0.2 — Editor de EAP com hierarquia real

A EAP é o primeiro ponto em que a plataforma deve deixar de parecer uma demonstração. A entrega mínima precisa permitir:

- criar grupo, pacote e entrega;
- editar nome, código, unidade e quantidade;
- adicionar filho e irmão;
- mover nó para outro pai;
- excluir com confirmação e impacto informado;
- selecionar um nó e visualizar seus atributos completos;
- validar estrutura;
- mostrar erros de hierarquia, duplicidade, unidade e quantidade;
- impedir aprovação enquanto houver erro estrutural.

A montagem automática de um plano inicial deve continuar existindo, mas como acelerador. Ela não pode ser a principal forma de criar uma EAP.

#### P0.3 — Editor de atividades e dependências

O Cronograma precisa ser mais do que um Gantt editável. A primeira versão operacional deve incluir:

- criar, editar e excluir atividade;
- vincular atividade a um pacote da EAP;
- informar duração ou datas planejadas;
- definir predecessora, sucessora, tipo e defasagem;
- mostrar referências inválidas;
- validar ciclos;
- recalcular CPM;
- mostrar caminho crítico e folgas;
- indicar quais atividades foram alteradas desde a última validação.

O usuário precisa conseguir explicar por que uma atividade é crítica, e não apenas enxergar uma cor no Gantt.

#### P0.4 — Máquina de estados e painel de gate

A Fase 4 deve virar uma experiência visível. Cada obra precisa ter um painel contendo:

- estado atual;
- versão do plano;
- gate atual;
- condições aprovadas;
- bloqueios pendentes;
- próxima ação recomendada;
- autor da última decisão;
- histórico de reaberturas e rejeições.

A decisão deve funcionar como um fluxo de revisão. O coordenador deve conseguir aprovar, aprovar parcialmente, rejeitar ou reabrir, sempre com escopo e justificativa.

### P1 — transformar produção em controle de obra

Depois que o planejamento estiver validado, a Produção deve evoluir de formulário de lançamento para controle diário.

A sequência recomendada é:

1. lançamento em rascunho;
2. revisão do lançamento;
3. confirmação;
4. correção controlada;
5. fechamento do dia;
6. cálculo de produtividade;
7. comparação entre planejado e realizado;
8. geração de alerta quando o ritmo ameaçar uma atividade crítica.

A produção confirmada deve atualizar uma visão diária e acumulada. O sistema deve diferenciar explicitamente quantidade planejada, quantidade realizada, saldo e ritmo necessário para cumprir o prazo.

Também deve haver uma tela para consultar os lançamentos existentes. Atualmente, o registro é persistido, mas a experiência precisa permitir localizar, filtrar e revisar o histórico.

### P2 — restrições com ciclo de tratamento

A restrição deve possuir responsável, data de vencimento, prioridade, ação prevista, evidência e estado. O mínimo é:

- aberta;
- atribuída;
- em tratamento;
- resolvida;
- rejeitada ou obsoleta;
- reaberta.

Uma restrição que bloqueia uma atividade deve apontar para a atividade ou pacote correspondente. Quando o prazo vencer, ela deve aparecer no painel da obra e no relatório executivo.

O agente pode sugerir classificação e impacto, mas não deve encerrar uma restrição sem decisão humana registrada.

### P3 — relatórios que respondem perguntas de gestão

Relatórios não devem ser apenas cartões com contagem. A primeira entrega deve responder perguntas práticas:

- Qual é o avanço planejado e qual é o avanço realizado?
- Quais atividades estão atrasadas?
- Quais atividades críticas estão em risco?
- Qual equipe ou frente produziu abaixo do ritmo esperado?
- Quais restrições estão vencidas?
- Qual é o próximo marco relevante?
- Qual decisão está bloqueando o plano?

A saída deve incluir uma visão de portfólio e uma visão detalhada por obra. Exportação para PDF ou Excel pode vir depois; primeiro os indicadores precisam ser confiáveis e rastreáveis ao banco.

### P4 — agente como coordenador explicável

A evolução do agente deve ocorrer depois que os dados básicos estiverem completos. O agente deve:

- explicar o estado atual da obra;
- citar a versão do plano usada na análise;
- distinguir fato, premissa, hipótese e lacuna;
- apontar o gate que bloqueia a progressão;
- sugerir uma ação sem executá-la automaticamente;
- relacionar recomendação com atividade, EAP, restrição ou decisão;
- preservar o histórico da resposta e das fontes.

O agente não deve ser usado para esconder a falta de telas de cadastro e validação. A interface operacional precisa funcionar mesmo sem LLM.

## O que não deve ser prioridade agora

Não recomendo, neste momento:

- reescrever todo o sistema como desktop;
- adicionar escrita automática nos MCPs;
- criar mais módulos visuais sem operações completas;
- ampliar o chat antes de consolidar os dados do planejamento;
- investir em animações e métricas decorativas;
- trocar de banco apenas porque o Aiven Free dormiu;
- construir uma fila complexa antes de existir um fluxo funcional validado.

O sistema parecerá mais completo quando o usuário puder executar uma obra de ponta a ponta, e não quando a navegação tiver mais itens.

## Critérios de aceite da próxima entrega

A próxima entrega funcional deve ser aceita somente quando uma obra nova puder passar pelo seguinte teste:

1. o usuário cria o descritivo;
2. o sistema informa o que falta para o descritivo;
3. o usuário cria ou ajusta uma EAP;
4. o sistema valida a EAP e explica os erros;
5. o usuário cria atividades vinculadas aos pacotes;
6. o usuário cria dependências;
7. o sistema bloqueia ciclos;
8. o sistema calcula o CPM;
9. o usuário vê quais atividades são críticas e por quê;
10. o sistema cria uma versão proposta do plano;
11. o usuário aprova ou rejeita a versão;
12. uma alteração na EAP invalida o CPM e a aprovação dependente;
13. o painel mostra o próximo gate e a ação necessária;
14. todos esses estados continuam corretos depois de sair e entrar novamente no sistema.

Esse teste é mais importante do que apenas verificar se a aplicação compila.

## Próximo checkpoint técnico

O próximo checkpoint sugerido pelo documento continua válido, mas deve ser ampliado para entregar valor de produto:

```text
feat: versionar planos, controlar gates e completar fluxo de planejamento
```

A ordem interna do checkpoint deve ser:

1. centralizar estados e transições;
2. criar `project_plan_versions` com migração compatível;
3. implementar validadores de gate no backend;
4. criar painel visual de estado e bloqueios;
5. implementar CRUD hierárquico da EAP;
6. implementar dependências e validação de ciclos;
7. integrar o cálculo de CPM ao gate;
8. escrever testes de aprovação, rejeição, reabertura e invalidação;
9. só depois expandir produção, relatórios e agente.

## Decisão recomendada

O sistema não precisa ser abandonado nem refeito. Ele precisa mudar de **dashboard com módulos** para **produto com fluxo operacional**.

A Fase 4 deve continuar, mas não como uma camada abstrata de estados. Ela deve controlar um primeiro fluxo de planejamento que o usuário consiga executar na tela. A prioridade imediata é entregar EAP editável, cronograma com dependências e CPM validado, tudo associado a uma versão e protegido por gates.

Essa mudança dará mais substância ao sistema sem exigir pagamento de infraestrutura, desktop ou novas integrações. O ambiente gratuito pode continuar sendo usado enquanto o produto é construído.

## Referências

[1]: https://github.com/ragomes102030-cpu/plataforma-obras "Repositório Plataforma Obras"
[2]: https://github.com/ragomes102030-cpu/plataforma-obras/blob/main/client/src/pages/Home.tsx "Navegação e módulos da interface"
[3]: https://github.com/ragomes102030-cpu/plataforma-obras/blob/main/server/routers.ts "Rotas de projetos, produção e agente"
[4]: https://github.com/ragomes102030-cpu/plataforma-obras/blob/main/drizzle/schema.ts "Schema do banco da aplicação"
[5]: https://github.com/ragomes102030-cpu/plataforma-obras/blob/main/client/src/components/OperationalViews.tsx "Visões operacionais atuais"
[6]: https://github.com/ragomes102030-cpu/plataforma-obras/blob/main/client/src/components/EapView.tsx "Tela atual de EAP"
[7]: https://github.com/ragomes102030-cpu/plataforma-obras/blob/main/client/src/components/ProductionView.tsx "Tela atual de produção"
