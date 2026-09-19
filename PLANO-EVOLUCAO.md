# Plano de evolução — Plataforma Obras + LLM + MCP

Este documento é o checkpoint operacional da evolução. Se a sessão ou os créditos terminarem, retome pelo primeiro item marcado como **PENDENTE** sem refazer os itens concluídos.

## Marco atual — checkpoint 2026-09-19

**Status:** estrutura de integração criada e validada localmente; nenhum MCP recebeu operação de escrita.

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

## Fases seguintes

### Fase 1 — configuração e observabilidade [PENDENTE]

Adicionar no Render as URLs `MCP_EAP_URL`, `MCP_CRONOGRAMA_URL` e `MCP_GANTT_LOB_URL`. Criar uma rota protegida `integrations.status` que liste ferramentas e mostre latência/último erro sem vazar credenciais.

**Pronto quando:** a interface mostrar os três MCPs como online/offline e o backend registrar falhas com `requestId`.

### Fase 2 — identidade e mapeamento de projetos [PENDENTE]

Criar uma tabela local de integrações de obra, relacionando `localProjectId`, `provider`, `externalProjectId`, URL e estado de sincronização. Nunca usar o projeto `default` para dados reais sem vínculo explícito.

**Pronto quando:** uma obra local puder apontar para um `project_id` externo distinto em cada MCP.

### Fase 3 — criação assistida de obra [PENDENTE]

Implementar um fluxo em três passos: rascunho local, prévia das operações MCP e confirmação do usuário. A confirmação deve criar o projeto no MCP de EAP, salvar o vínculo local e só depois montar a EAP.

**Pronto quando:** o usuário visualizar um resumo antes de qualquer escrita e puder cancelar sem alteração externa.

### Fase 4 — importação EAP e cronograma [PENDENTE]

Importar templates ou nós da EAP, validar estrutura, criar atividades vinculadas por `eap_ref`, criar dependências idempotentes e chamar `calcular_caminho_critico`.

**Pronto quando:** o Gantt local e o banco exibirem os mesmos nós, IDs externos e datas calculadas.

### Fase 5 — baseline, produção e Linha de Balanço [PENDENTE]

Salvar baseline, comparar desvios, importar progresso, calcular curva S e usar `calcular_linha_balanco`. Para risco de interferência, chamar `balancear_ritmos_lob` e apresentar alternativas de equipes.

**Pronto quando:** uma obra repetitiva mostrar ritmo por unidade, espera e risco de interferência.

### Fase 6 — agente LLM com ferramentas controladas [PENDENTE]

Conectar o agente a funções internas do backend, não diretamente às URLs. Consultas poderão ser automáticas; criações e alterações exigirão confirmação; exclusões serão bloqueadas por padrão. Registrar prompt, ferramenta, argumentos sanitizados, usuário, resultado e timestamp.

**Pronto quando:** o agente responder perguntas com dados reais e nunca executar uma ferramenta fora da allowlist.

### Fase 7 — auditoria, testes e operação [PENDENTE]

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

Depois implemente a **Fase 1 — configuração e observabilidade**. Não avance para operações de escrita antes de concluir a Fase 2.
