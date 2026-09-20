# Arquitetura do Agente Coordenador de Obras

## Decisão executiva

A Plataforma Obras terá **um único Agente Coordenador por obra**, persistente entre as abas EAP, Cronograma, Gantt/Linha de Balanço, Produção e Relatórios. As abas não possuem agentes diferentes. Elas fornecem foco, seleção e evidências ao mesmo coordenador.

O coordenador combina cinco capacidades que devem permanecer separadas:

1. **Planejador:** transforma o descritivo em EAP, atividades, precedências, CPM, cronograma e produção.
2. **Auditor:** procura erros e contradições nos dados do cliente e nos três MCPs.
3. **Memória:** recupera somente fatos, decisões e padrões aprovados para aquela obra ou cliente.
4. **Orquestrador:** escolhe o domínio MCP correto, respeita o marco da obra e explica lacunas.
5. **Executor controlado:** prepara prévias e só executa mutações após confirmação, idempotência e auditoria.

A DeepSeek é o motor de interpretação e decisão assistida. Ela não é a fonte de verdade, não recebe segredos e não substitui validações determinísticas dos MCPs.

## Visão de produto

```text
Usuário escolhe uma obra
        ↓
Project Planning Coordinator
        ├── Estado e gates da obra
        ├── Memória aprovada
        ├── Auditoria e achados
        ├── Contexto da aba ativa
        ├── Adaptador MCP EAP
        ├── Adaptador MCP Cronograma
        ├── Adaptador MCP Gantt/LOB
        └── Executor de mutações confirmadas
```

A conversa é da obra. A aba apenas muda o foco:

```text
EAP          → estrutura, nós, folhas, quantidades e divergências
Cronograma   → atividades, precedências, CPM, folgas e baseline
Gantt/LOB    → representação, ritmo, repetição e interferência
Produção     → realizado, produtividade, equipes e desvios
Relatórios   → evidências, decisões, riscos e histórico
```

O coordenador pode contrariar o foco da aba quando encontrar a causa em outro domínio. Exemplo: na aba Cronograma, informar que a atividade está bloqueada porque a origem na EAP ainda não foi aprovada.

## Modelo mental do coordenador

O sistema não terá três agentes especialistas conversando entre si. Terá um agente com **um ciclo interno de trabalho**:

```text
1. Entender pedido e aba ativa
2. Recuperar estado e memória aprovada
3. Identificar marco permitido
4. Consultar evidências MCP necessárias
5. Rodar validações determinísticas
6. Comparar fontes e detectar achados
7. Montar proposta ou diagnóstico
8. Pedir decisão do cliente
9. Registrar decisão
10. Avançar, reabrir ou bloquear o marco
```

A mesma LLM pode executar os papéis de planejador, auditor e explicador em momentos diferentes, mas os limites do sistema devem ser impostos pelo backend.

## Máquina de estados da obra

```text
DESCRITIVO
  ↓ entendimento aprovado
EAP_PROPOSTA
  ↓ revisão de todos os nós
EAP_REVISAO
  ↓ EAP sem bloqueios + aprovação explícita
ATIVIDADES_PROPOSTA
  ↓ atividades e quadro de sequenciação aprovados
DEPENDENCIAS_PROPOSTA
  ↓ dependências válidas e sem ciclos
CPM_VALIDADO
  ↓ premissas e caminho crítico aprovados
CRONOGRAMA_PROPOSTO
  ↓ cronograma aprovado
BASELINE_PROPOSTA
  ↓ baseline confirmada
GANTT_LOB_PROPOSTO
  ↓ plano de produção aprovado
CONTROLE
```

Cada estado possui:

- pré-condições verificáveis;
- ferramentas permitidas;
- validações obrigatórias;
- evidências mínimas;
- bloqueadores;
- aprovação necessária;
- impacto de reabertura.

A troca de aba nunca muda o estado. Abrir Gantt antes da EAP aprovada apenas permite visualização limitada e explica o bloqueio.

## Gates de aprovação

### Gate 0 — Descritivo

O agente extrai tipo de obra, localização, área, unidades repetitivas, método construtivo, frentes, restrições e marcos. Se faltar informação essencial, faz perguntas antes de propor EAP.

### Gate 1 — EAP

O agente consulta a árvore atual e templates de referência, propõe a decomposição e pede ao cliente a revisão de todos os nós. Deve exibir código, UID, descrição, tipo de frente, local, unidade, quantidade, folha/pacote e dúvida.

`validar_estrutura` é obrigatório. Problemas bloqueiam. Avisos são exibidos para decisão.

### Gate 2 — Atividades

Cada atividade precisa de `eap_ref`, nome, duração determinística ou PERT, unidade/escopo, premissa e status. O agente mostra a transformação pacote EAP → atividade e solicita revisão.

### Gate 3 — Dependências e CPM

O agente apresenta quadro de sequenciação, cria ou propõe as relações e chama validação de dependências. Ciclos e precedências incoerentes bloqueiam. Só depois calcula caminho crítico, folgas e prazo total.

### Gate 4 — Cronograma e baseline

O cronograma é derivado da rede. Gantt não pode criar lógica alternativa. Baseline candidata só vira baseline aprovada após confirmação explícita.

### Gate 5 — Produção e LOB

A Linha de Balanço é usada se houver repetição espacial/produtiva. Ritmos, unidades, equipes e interferências devem ser apresentados como dados ou recomendações claramente separados.

### Gate 6 — Controle

O agente compara baseline, curva S e realizado; classifica desvio, risco e ação. Replanejamento nunca sobrescreve a baseline original.

## Auditoria ativa

O coordenador deve procurar problemas sem depender de uma pergunta do cliente. O auditor deve produzir achados com:

```text
id
classificacao: bloqueador | alerta | recomendacao
entidade: eap | atividade | dependencia | baseline | unidade | producao
referencia
fonte_a
valor_a
fonte_b
valor_b
descricao
impacto
confianca
correcao_proposta
status: aberto | confirmado | rejeitado | resolvido | obsoleto
```

Classes mínimas:

- estrutural;
- semântica;
- quantitativa;
- unidade;
- referência quebrada;
- temporal;
- dependência/ciclo;
- CPM;
- baseline;
- progresso/produção;
- Linha de Balanço;
- conflito entre domínios.

O agente nunca corrige silenciosamente. Ele preserva o original, mostra evidência, propõe correção e aguarda confirmação.

## Memória e aprendizado seguro

“Aprender” significa acumular conhecimento aprovado e rastreável, não treinar novamente o modelo a cada obra.

### Camada 1 — Memória da obra

Fatos, decisões, padrões de EAP, produtividade observada, restrições, correções e aprovações específicos da obra.

### Camada 2 — Memória do cliente

Preferências reutilizáveis entre obras do mesmo cliente, sempre com escopo, origem e possibilidade de desativação.

### Camada 3 — Biblioteca geral

Templates e padrões genéricos, sem misturar dados identificáveis ou produtividades privadas de outros clientes.

Toda memória deve possuir:

```text
scope: obra | cliente | biblioteca
project_id opcional
owner_user_id
category
key
value_json
source_type
source_ref
confidence
status: proposta | aprovada | rejeitada | obsoleta
approved_by
approved_at
created_at
updated_at
```

Somente `aprovada` pode entrar automaticamente no contexto do agente. Memória proposta deve aparecer para confirmação. Memória rejeitada não deve ser reapresentada como recomendação sem novo motivo.

### Eventos que alimentam a memória

- aprovação de EAP;
- correção de quantidade, unidade ou nome;
- decisão de precedência;
- aceitação/rejeição de duração PERT;
- baseline aprovada;
- confirmação de produtividade;
- restrição registrada;
- correção de erro encontrada pelo auditor;
- preferência explícita do cliente.

A memória deve apontar para a fonte e para a decisão que a aprovou. O agente deve poder responder “isso vem da aprovação do Marco 1 da obra X”, e não apenas “eu lembro”.

## Contexto enviado à LLM

O contexto deve ser montado em camadas e limitado:

1. identidade da obra e usuário;
2. estado atual e gates aprovados;
3. aba, subtaba e entidade selecionada;
4. decisões aprovadas relevantes;
5. memórias da obra;
6. preferências do cliente aplicáveis;
7. achados abertos e bloqueadores;
8. resumo local;
9. resultados MCP consultados nesta execução;
10. instruções da skill.

A LLM não deve receber toda a memória histórica nem todo o banco. O backend recupera apenas itens relevantes ao pedido, ao estado e à aba.

## Roteamento de ferramentas

A escolha de ferramenta é condicionada por estado:

| Estado/foco | Ferramentas prioritárias |
|---|---|
| EAP | `get_eap_tree`, `get_eap_node`, `listar_templates`, `listar_por_tipo_frente`, `buscar_eap_node`, `validar_estrutura` |
| Atividades | `listar_atividades` e referências EAP |
| CPM | `listar_dependencias`, `validar_dependencias`, `calcular_caminho_critico` |
| Cronograma | CPM, `listar_baselines`, `curva_s` |
| Gantt | cronograma validado e `gerar_gantt` |
| LOB | `calcular_linha_balanco`, `balancear_ritmos_lob`, `dimensionar_equipes_lob` |
| Controle | `comparar_baseline`, `curva_s`, LOB e produção local |

A LLM recebe somente as ferramentas compatíveis com o modo atual. O backend continua validando domínio, `project_id`, política de leitura/escrita e autorização.

## Execução segura

Toda mutação futura seguirá:

```text
intenção do cliente
  → prévia calculada
  → lista de entidades afetadas
  → validações
  → token de confirmação
  → idempotency key
  → execução transacional
  → nova leitura/validação
  → memória da decisão
```

A criação de uma EAP, atividade, dependência ou baseline não pode ser disparada diretamente por texto livre sem passar por esse ciclo.

## Falhas e recuperação

- MCP indisponível: informar domínio, tentativa, erro e próxima ação; nunca transformar indisponibilidade em catálogo vazio.
- Resposta incompleta: marcar evidência incompleta e bloquear conclusões que dependam dela.
- Divergência entre MCPs: manter ambos os valores, abrir achado e pedir decisão.
- Timeout após possível escrita: repetir somente com a mesma idempotency key e consultar o resultado antes de tentar novamente.
- LLM sem resposta: preservar estado e permitir retomada pelo último marco.
- Memória conflitante: a decisão mais recente e aprovada prevalece; as anteriores ficam como histórico.

## Observabilidade

Cada execução deve registrar:

- task id;
- obra e usuário;
- estado no início e no fim;
- aba ativa;
- ferramentas chamadas;
- fontes usadas;
- achados criados/atualizados;
- decisões solicitadas;
- token de confirmação, quando houver;
- duração e erro de cada MCP;
- modelo e versão de instrução;
- resultado resumido, sem segredos.

## Roadmap de implementação

### Fase A — Coordenação somente leitura

Já iniciada: um orquestrador, mapeamentos MCP por domínio, política de leitura, auditoria, ordem metodológica e gates textuais.

### Fase B — Estado e memória auditável

Criar tabelas para estado da obra, decisões, fatos aprovados, preferências, achados e eventos. Adicionar procedures protegidos para leitura e aprovação.

### Fase C — Contexto por aba

Enviar seção, subtaba, entidade selecionada, estado e achados relevantes. Filtrar catálogo de ferramentas pelo marco atual sem criar múltiplos agentes.

### Fase D — Prévia e correções confirmadas

Expor intenções de mutação, diff de entidades afetadas, confirmação, idempotência e pós-validação.

### Fase E — Aprendizado controlado

Promover decisões e correções confirmadas para memória da obra; permitir ao cliente aceitar preferências entre obras; separar biblioteca genérica de dados privados.

### Fase F — Controle contínuo

Adicionar ciclos de medição, baseline, curva S, LOB, alertas e replanejamento sem apagar o histórico.

## Critérios de sucesso

O agente coordenador estará pronto quando:

- houver uma única conversa por obra entre todas as abas;
- a aba mudar o foco sem perder o histórico;
- a EAP bloquear o cronograma quando não aprovada;
- o agente encontrar erros sem ser perguntado;
- cada achado mostrar evidência, impacto e confiança;
- o cliente aprovar marcos e correções explicitamente;
- decisões aprovadas forem recuperadas depois;
- memórias de uma obra não vazarem para outra;
- mutações tiverem prévia, confirmação, idempotência e pós-validação;
- o agente puder explicar por que tomou cada decisão e de qual fonte ela veio.
