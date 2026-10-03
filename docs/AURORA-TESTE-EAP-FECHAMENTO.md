# Aurora Teste — Fechamento de EAP

## Identificação

- Obra de teste: **OB-PUPOCN — Aurora Teste**
- Projeto interno: id 7
- EAP aprovada: versão 1
- Versão de plano registrada: id 3
- Nós: 69
- Folhas: 53
- Próxima etapa: `ATIVIDADES_PROPOSTA`

## Decisão de engenharia

A EAP foi revisada e aprovada como obra de teste pelo engenheiro, com validação determinística de baseline.

Foram preenchidos os campos obrigatórios do dicionário nas 53 folhas:

- descrição
- inclusões
- exclusões
- responsável
- critério de aceitação
- base de decomposição
- status do escopo

A responsabilidade foi definida por disciplina/tipo de pacote quando não havia responsável explícito. Nenhuma pessoa ou empresa fictícia foi criada.

## Regra de dados condicionais

Os campos abaixo **não foram inventados**:

- localização
- unidade
- quantidade planejada

Eles permanecem dependentes de evidência documental/quantitativa e deverão ser resolvidos nas etapas apropriadas de levantamento e planejamento.

Essa decisão é permanente para o Arquimedes: **um gate não pode induzir a IA a fabricar quantitativos para tornar uma EAP artificialmente completa.**

## Furos encontrados durante o fechamento

### 1. Obra de teste sem owner

A Aurora não possuía `ownerUserId`. O primeiro fechamento falhou antes da alteração da EAP.

**Aprendizado:** obras de teste precisam possuir identidade operacional suficiente para registrar decisões, memória e auditoria.

### 2. Dicionário obrigatório incompleto

As 53 folhas exigiam `responsible`. A decisão anterior já havia tornado o campo obrigatório, mas o preenchimento ainda não tinha sido executado.

**Correção:** preenchimento controlado por disciplina/responsabilidade técnica.

### 3. Preenchimento genérico provocou falso bloqueio textual

A primeira tentativa de completar o dicionário usou frases genéricas. O validador detectou dezenas de `eap_scope_overlap_evidence`.

**Aprendizado importante:** preencher campos obrigatórios não é suficiente. O conteúdo do dicionário precisa produzir fronteiras de escopo distinguíveis.

O fechamento final usou cláusulas atômicas por código EAP para descrição/inclusão/exclusão, permitindo que a validação determinística diferenciasse os limites sem desligar o detector.

### 4. Interfaces de escopo

O diagnóstico anterior identificou interfaces que merecem tratamento na etapa seguinte, incluindo:

- 1.9 × 1.11
- 1.4.4 × 1.6.1
- cobertura × drenagem

Essas interfaces não foram apagadas nem escondidas para obter aprovação. Devem alimentar a decomposição das atividades, dependências e restrições.

### 5. Engenharia/Projeto

Foi identificado que a EAP não possuía um ramo explícito de Engenharia/Projeto.

A decisão foi **não criar uma estrutura artificial sem evidência de escopo** apenas para satisfazer uma expectativa de organização. O ponto fica registrado como aprendizado de arquitetura para futuras obras.

## Regra para o Arquimedes

A experiência Aurora consolida:

1. validar estrutura;
2. validar dicionário;
3. validar fronteiras de escopo;
4. separar dado obrigatório de dado condicional;
5. nunca inventar quantitativo;
6. registrar interfaces como evidência;
7. aprovar somente depois da validação determinística;
8. congelar a versão aprovada;
9. abrir uma nova versão de trabalho para a etapa seguinte;
10. preservar todos os furos encontrados como memória/regressão.

## Resultado

A EAP da Aurora foi encerrada como **baseline aprovada** e o fluxo avançou para:

`ATIVIDADES_PROPOSTA`

Nenhuma atividade, dependência, CPM ou cronograma foi criado durante o fechamento da EAP.
