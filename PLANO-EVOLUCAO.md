# Plano de evolução — Plataforma Obras + LLM + MCP

Este documento é o checkpoint operacional da evolução. Se a sessão ou os créditos terminarem, retome pelo primeiro item marcado como **PENDENTE** sem refazer os itens concluídos.

## Marco atual — checkpoint 2026-09-20

**Status:** Fases 1 e 2 concluídas; homologação somente leitura implementada para iniciar a validação dos vínculos externos. Nenhum MCP recebeu operação de escrita.

Já confirmado:

- `mcp-eap-server` v1.29.1, com EAP hierárquica, projetos, quantitativos, critérios, templates e retrabalho.
- `mcp-cronograma-server` v1.29.1, com atividades, PERT/CPM, dependências, baseline e curva S.
- `mcp-gantt-lob-server` v4.0.3, com Gantt `.xlsx`, Linha de Balanço, balanceamento e dimensionamento de equipes.
- O protocolo é MCP `2025-03-26` sobre `POST /mcp`, com sessão e respostas SSE/JSON.
- O banco local continua sendo mantido para usuários, permissões, cache, histórico e auditoria.

### Código já estruturado

- `server/integrations/mcp-client.ts`: cliente MCP com handshake, sessão, timeout e `tools/list`/`tools/call`.
- `server/integrations/construction-mcps.ts`: adaptadores dos três domínios e allowlist de ferramentas.
- `server/integrations/mcp-client.test.ts`: testes sem rede.
- `render.yaml` e `server/_core/env.ts`: URLs configuráveis por ambiente.
- `integrations.mcpStatus`: sondagem independente dos três MCPs, com `requestId`, latência, ferramentas e último erro por servidor.
- Barra do agente: status individual de EAP, Cronograma e Gantt/LOB, preservando modo local quando uma fonte estiver indisponível.
- `project_mcp_integrations`: vínculo local persistido por obra e domínio, com `externalProjectId`, endpoint, estado de sincronização, último erro e data da última sincronização.
- Tela EAP: editor dos três `project_id` externos; salvar o vínculo não executa nenhuma operação no MCP.
- `mcp_mutation_operations`: prévia local, confirmação explícita, chave de idempotência, auditoria e resultado da primeira mutação controlada.
- Bancada da EAP: teste de `criar_eap_node` no MCP EAP com JSON visível e confirmação digitada `CONFIRMAR`.
- `mcp_homologation_runs`: registro de cada corredor E2E, com plano, probes somente leitura, reconciliação e estado final.
- Corredor E2E da EAP: executa leitura dos três MCPs e pode reconciliar uma operação de mutação já concluída, sem criar uma nova mutação.

## Fases seguintes

### Fase 1 — configuração e observabilidade [CONCLUÍDA]

As URLs `MCP_EAP_URL`, `MCP_CRONOGRAMA_URL` e `MCP_GANTT_LOB_URL` estão declaradas no blueprint do Render e possuem fallback público controlado no backend. A rota protegida `integrations.mcpStatus` lista as ferramentas de cada servidor em sondagens independentes, mostra latência e último erro sem vazar credenciais e registra falhas estruturadas com `requestId`.

**Pronto quando:** a interface mostra os três MCPs como online/offline e o backend registra falhas com `requestId`.

### Fase 2 — identidade e mapeamento de projetos [CONCLUÍDA]

Criada a tabela local `project_mcp_integrations`, relacionando `projectId`, `provider`, `externalProjectId`, URL e estado de sincronização. A API expõe leitura dos três vínculos e gravação protegida por obra, rejeitando `project_id=default`. O salvamento é exclusivamente local e não chama ferramentas externas.

**Pronto quando:** uma obra local pode apontar para um `project_id` externo distinto em cada MCP.

### Fase 3 — homologação somente leitura [CONCLUÍDA]

A API expõe `integrations.homologateProject`, que exige os três vínculos externos, executa uma consulta permitida por domínio, registra `requestId`, ferramenta, latência e erro, atualiza o estado local de sincronização e retorna o resultado à tela da EAP. A rotina não inclui ferramentas de criação, alteração, baseline, medição ou exclusão.

**Pronto quando:** a obra possuir os três identificadores externos e o usuário puder executar uma homologação segura, com resultado individual por MCP.

### Fase 4 — mutação controlada [EM HOMOLOGAÇÃO]

Implementado o fluxo de três passos para a primeira operação segura: prévia local, confirmação explícita e execução idempotente de `criar_eap_node` no MCP EAP. Exclusões e demais mutações permanecem bloqueadas. A criação assistida completa de obra, incluindo `criar_projeto`, permanece pendente até a homologação real em uma obra de teste.

**Pronto quando:** uma obra de homologação executar uma mutação aprovada, com auditoria local, sem duplicidade e sem permitir exclusão.

### Fase 5 — testes integrados E2E [EM HOMOLOGAÇÃO]

Implementado o corredor de ponta a ponta da bancada: valida os três vínculos, executa os probes somente leitura, aceita opcionalmente o ID de uma mutação concluída e grava a reconciliação local. Nenhuma nova mutação é executada pelo corredor. A importação EAP/cronograma permanece como etapa seguinte.

**Pronto quando:** uma execução E2E aprovada registrar os três MCPs como aprovados e reconciliar a operação controlada com a obra local.

### Fase 6 — importação EAP e cronograma [PENDENTE]

Importar templates ou nós da EAP, validar estrutura, criar atividades vinculadas por `eap_ref`, criar dependências idempotentes e chamar `calcular_caminho_critico`.

**Pronto quando:** o Gantt local e o banco exibirem os mesmos nós, IDs externos e datas calculadas.

### Fase 7 — baseline, produção e Linha de Balanço [PENDENTE]

Salvar baseline, comparar desvios, importar progresso, calcular curva S e usar `calcular_linha_balanco`. Para risco de interferência, chamar `balancear_ritmos_lob` e apresentar alternativas de equipes.

**Pronto quando:** uma obra repetitiva mostrar ritmo por unidade, espera e risco de interferência.

### Fase 8 — agente LLM com ferramentas controladas [PENDENTE]

Conectar o agente a funções internas do backend, não diretamente às URLs. Consultas poderão ser automáticas; criações e alterações exigirão confirmação; exclusões serão bloqueadas por padrão. Registrar prompt, ferramenta, argumentos sanitizados, usuário, resultado e timestamp.

**Pronto quando:** o agente responder perguntas com dados reais e nunca executar uma ferramenta fora da allowlist.

### Fase 9 — auditoria, testes e operação [PENDENTE]

Adicionar testes de contrato com mocks HTTP, idempotência, retry limitado, correlação de `requestId`, reconciliação local/MCP e política de recuperação quando um MCP estiver offline.

**Pronto quando:** CI validar os adaptadores sem depender dos serviços públicos e um MCP indisponível não derrubar o painel.

## Regras de segurança

- Não colocar tokens MCP no GitHub, frontend ou logs.
- Não permitir que o LLM escolha livremente qualquer nome de ferramenta.
- Não aceitar `project_id=default` para obras autenticadas sem confirmação explícita.
- Toda operação de escrita deve ter prévia, confirmação e idempotência.
- Toda exclusão deve exigir confirmação forte e registro de auditoria.
- CPM, datas, ciclos e cálculos de Linha de Balanço permanecem determinísticos; o LLM apenas interpreta, coordena e explica.

## Próximo comando de retomada

Ao retomar, execute:

```bash
pnpm check && pnpm test --run && pnpm build
```

Depois execute a homologação somente leitura da **Fase 3** em uma obra de teste. Não avance para operações de escrita antes de confirmar os três resultados como aprovados.

## Decisão arquitetural após análise do Hermes

A referência analisada é o **Hermes Agent da Nous Research**. A decisão é adotar os princípios de arquitetura, não copiar o produto inteiro para dentro da Plataforma Obras.

O Hermes separa claramente o loop do agente, montagem de prompt, resolução do provedor, registro de ferramentas, persistência de sessão, memória, plugins e gateway. Seu loop executa: preparar contexto, chamar o modelo, executar ferramentas, anexar resultados, repetir até resposta final, persistir a sessão e aplicar compressão quando necessário. Essa separação é apropriada para a Plataforma Obras.

### Princípios que serão adotados

1. **Agent Orchestrator único no backend.** A interface não chamará LLM ou MCP diretamente. O orquestrador receberá a intenção, montará o contexto da obra, decidirá quais ferramentas são elegíveis, executará o ciclo e devolverá eventos de progresso.
2. **Gerenciador de provedores.** O sistema usará uma interface OpenAI-compatible para OpenRouter, API própria ou outro provedor, com modelo, timeout, limite de iterações e fallback configuráveis por ambiente.
3. **Registro de ferramentas com exposição controlada.** Cada MCP/plugin terá catálogo, descrição, esquema, classificação de risco e allowlist por perfil. O LLM nunca poderá inventar o nome de uma ferramenta nem ultrapassar a permissão recebida.
4. **Aprovação antes de escrita.** O agente poderá preparar uma operação e mostrar uma prévia; criação, alteração de baseline, medição e exclusão somente serão executadas após confirmação compatível com o risco.
5. **Memória em camadas.** A memória persistente não será um texto livre gigante. Haverá memória de preferências do usuário, memória de projeto, decisões aprovadas, fatos extraídos de documentos e histórico de sessões. Cada item terá origem, data, autor, confiança e possibilidade de correção.
6. **Contexto sob demanda.** No início, somente ferramentas e dados da obra selecionada serão expostos. Se o catálogo crescer, será adotada descoberta progressiva de ferramentas, equivalente ao Tool Search do Hermes, para não despejar todos os schemas no prompt.
7. **Sessões e tarefas retomáveis.** Cada execução terá `taskId`, `projectId`, `requestId`, estado, passos, tool calls e resultado. Se a sessão terminar, o próximo ciclo poderá continuar do último passo confirmado, sem repetir escritas idempotentes.
8. **Cálculo fora do LLM.** CPM, ciclos, datas, baseline, quantitativos e Linha de Balanço permanecem em código/MCP determinístico. O agente coordena e explica, mas não substitui esses cálculos.

### O que não será copiado agora

- Não instalar o Hermes inteiro como dependência do Render.
- Não permitir autoaperfeiçoamento irrestrito do agente.
- Não deixar o agente criar plugins ou alterar seus próprios prompts em produção.
- Não compartilhar um único arquivo de memória entre todas as obras e usuários.
- Não iniciar multiagentes antes de existir uma tarefa única confiável, auditável e retomável.
- Não permitir que “memória” substitua o banco, a auditoria ou os documentos originais.

## Roadmap revisado, com os pés no chão

### Marco A — base verificável [EM ANDAMENTO]

Cliente MCP, adaptadores, allowlist, rotas protegidas, URLs de ambiente e plano versionado. Este marco está entregue no commit `c8ea741`.

### Marco B — Agent Orchestrator mínimo [CONCLUÍDO]

Implementado em `server/orchestrator.ts`, exposto por `agent.orchestrate`. O ciclo recebe uma obra, monta contexto limitado, carrega somente ferramentas MCP allowlisted de leitura, chama o provedor, executa até quatro iterações, registra cada tool call e devolve `taskId`, modelo, iterações e auditoria. O endpoint aceita `mcpProjectId` explícito e bloqueia consultas de obra sem esse vínculo para não cair no projeto `default`.

**Limite aplicado:** uma obra por execução, nenhuma escrita externa, máximo de quatro iterações e resultado truncado por ferramenta. Testes cobrem consulta MCP, auditoria, exposição de ferramentas e bloqueio de escrita.

### Marco C — memória e sessões [PRÓXIMO]

Criar tabelas de sessões, mensagens, fatos de projeto, decisões e memórias. O agente poderá sugerir uma memória, mas fatos importantes terão origem e confirmação. Documentos permanecerão vinculados ao arquivo e à versão de origem.

### Marco LLM-1 — gateway multi-provedor [CONCLUÍDO]

Implementado em `server/llm-provider-gateway.ts`. O orquestrador deixou de chamar um único endpoint e passou a usar uma camada OpenAI-compatible com provedor primário, dois fallbacks opcionais, compatibilidade com OpenRouter/Gemini/Groq/Cerebras/OpenCode Zen quando configurados, timeout, tratamento de `401`/`402`/`403`/`429`/`5xx` e normalização de resposta. Nenhuma chave é armazenada no código.

Variáveis disponíveis no Render: `LLM_PRIMARY_*`, `LLM_FALLBACK_*`, `LLM_SECONDARY_*`, `LLM_MAX_ATTEMPTS` e `LLM_REQUEST_TIMEOUT_MS`. As variáveis antigas `AI_API_*` e `BUILT_IN_FORGE_*` continuam como compatibilidade legada.

**Importante:** o gateway não assume que um modelo gratuito suporta tool calling só porque a API é OpenAI-compatible. Antes de ativar um provedor, executar teste de compatibilidade com chamada de ferramenta e validar os argumentos.

## Plano mestre de produto

O plano detalhado de produto, arquitetura e prioridade de produção/medição está em [`PLANO-MESTRE-PRODUCAO-MEDICAO.md`](./PLANO-MESTRE-PRODUCAO-MEDICAO.md), com o diagrama em [`ARQUITETURA-PLATAFORMA-OBRAS.png`](./ARQUITETURA-PLATAFORMA-OBRAS.png).

### Marco D — mapeamento local ↔ MCP [ANTES DE QUALQUER ESCRITA]

Criar vínculos por obra para os `project_id` externos, com tenant/usuário, servidor, data da última sincronização, estado e versão. O valor `default` dos MCPs nunca será usado para uma obra real autenticada.

### Marco E — escrita com prévia e confirmação

Implementar o fluxo de rascunho: o agente gera operações, a interface mostra a diferença, o usuário confirma, o backend executa em ordem idempotente e grava auditoria. Começar por `criar_projeto`, depois EAP, atividades e dependências.

### Marco F — documentos

Adicionar upload, extração, versionamento, classificação e busca por obra. O agente deverá citar documento, página/aba, versão e trecho usado, especialmente em contrato, orçamento e medição.

### Marco G — plugins e descoberta progressiva

Adicionar plugins internos de Excel, PDF, relatórios e notificações. Só quando o número de ferramentas justificar, implementar `tool_search`, `tool_describe` e `tool_call` internos, sempre sobre o catálogo já permitido à sessão.

### Marco H — produção, Linha de Balanço e especialistas

Com a base funcionando, adicionar especialistas internos por domínio: planejamento, produção, custos/documentos e relatórios. Eles não serão agentes independentes no início; serão perfis/prompts e conjuntos de ferramentas do mesmo orquestrador. Multiagentes só entram depois de métricas de qualidade e auditoria.

## Critério de realidade do produto

A Plataforma Obras será considerada pronta para um piloto real quando conseguir executar, com dados de uma obra de teste:

- criar uma obra local e vinculá-la a projetos externos;
- montar e validar uma EAP;
- gerar atividades e dependências;
- calcular CPM e salvar baseline;
- mostrar curva S e Linha de Balanço;
- consultar documentos com evidência;
- recuperar uma tarefa interrompida;
- impedir escrita sem confirmação;
- registrar auditoria completa;
- continuar funcionando quando um MCP ou o provedor de LLM estiver indisponível.

Fontes consultadas: [Arquitetura do Hermes](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture), [Agent Loop](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop), [Memória persistente](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory), [MCP e filtros de ferramentas](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp), [Tool Search](https://hermes-agent.nousresearch.com/docs/user-guide/features/tool-search) e [Integração programática](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration).
