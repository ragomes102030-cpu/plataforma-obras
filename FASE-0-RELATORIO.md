# Fase 0 — Agente observável e confiável

**Repositório:** `ragomes102030-cpu/plataforma-obras`  
**Base:** `67b7e71`  
**Data:** 20 de setembro de 2026

## Resultado executivo

A Fase 0 foi implementada em modo somente leitura. O agente deixou de depender de uma única requisição tRPC síncrona que permanece em `isPending` durante a consulta aos MCPs e ao provider. Agora cada execução recebe um `request_id`, é registrada, retorna imediatamente ao frontend e pode ser acompanhada por polling até um estado final explícito.

Os estados terminais implementados são `respondido`, `falhou`, `timeout`, `aguardando_confirmacao` e `dados_incompletos`. O frontend não mantém mais um spinner sem contexto: mostra a etapa atual, o request ID e uma mensagem acionável quando a execução termina com erro, timeout ou dados incompletos.

## Causa raiz do travamento

A causa raiz comprovada no código é arquitetural: `agent.chat` e `agent.orchestrate` aguardavam a conclusão integral do orquestrador dentro da mesma requisição HTTP, enquanto a interface só recebia o booleano `isPending`. O caminho incluía catálogo MCP, retries/cold start dos três MCPs, chamadas de ferramenta e chamadas ao LLM, mas não persistia progresso nem impunha um estado final observável ao cliente. Qualquer demora do Render, do provider ou do MCP aparecia para o usuário como spinner indefinido.

Também foram confirmadas duas falhas secundárias que podiam mascarar o diagnóstico. O orquestrador aceitava uma resposta sem conteúdo textual como uma conclusão genérica, e o contrato do gateway não representava `reasoning` nem o provider efetivamente usado. Com a correção, uma resposta vazia, somente com reasoning ou somente com tool call termina como `dados_incompletos`, e cada etapa fica registrada.

A causa externa específica entre provider, endpoint de chat e MCP não pode ser isolada retrospectivamente sem os logs da execução publicada. Durante esta validação, a URL pública conhecida de saúde (`https://plataforma-obras-api.onrender.com/healthz`) não respondeu em 20 segundos, sem bytes recebidos, o que é compatível com indisponibilidade ou cold start do serviço, mas não permite afirmar qual dependência falhou. A nova instrumentação permite distinguir esses casos após o deploy.

## Implementação realizada

| Camada | Alteração |
|---|---|
| Execução | Novo `server/agent-execution.ts` com criação imediata do run, execução em background, timeout total, classificação de falhas e polling autenticado. |
| Observabilidade | Novas tabelas `agent_runs` e `agent_run_events`; registro de início, catálogo, LLM, tool calls, resultados, parsing, provider, duração implícita pelos timestamps e estado final. |
| Orquestrador | Eventos de ciclo, limite configurável de iterações, provider observado, validação de conteúdo final e fontes/lacunas explícitas na resposta. |
| Gateway | Contrato compatível com conteúdo em partes, `reasoning` e provider; os segredos continuam somente em variáveis de ambiente. |
| MCP | Timeout padrão reduzido para 25 s, cache TTL do catálogo, coalescência de chamadas simultâneas e erros de domínio preservados em vez de virarem catálogo vazio. |
| API | `agent.chat` e `agent.orchestrate` agora retornam o run inicial; `agent.status` consulta somente execuções do usuário autenticado. |
| Interface | `AgentView`, `AgentSidebar` e `AIChatBox` exibem etapa atual, polling, estados terminais, request ID e erro acionável. |
| Banco | Migração `drizzle/0011_old_next_avengers.sql` criada para as tabelas de execução e eventos. |

A política do agente não foi ampliada: as ferramentas continuam somente leitura e a Fase 6 de mutações não foi autorizada nem implementada.

## Configuração padrão

| Variável | Padrão | Finalidade |
|---|---:|---|
| `MCP_REQUEST_TIMEOUT_MS` | `25000` | Timeout individual de MCP. |
| `LLM_REQUEST_TIMEOUT_MS` | `60000` | Timeout individual de provider. |
| `AGENT_TOTAL_TIMEOUT_MS` | `120000` | Limite total da execução observável. |
| `AGENT_MAX_ITERATIONS` | `4` | Limite do loop de tool calls. |
| `MCP_CATALOG_TTL_MS` | `300000` | TTL do catálogo de ferramentas. |

## Evidências locais

| Verificação | Resultado |
|---|---|
| `pnpm test` | **36 testes passaram**, em 9 arquivos. |
| `pnpm check` | **Passou**, sem erros TypeScript. |
| `pnpm build` | **Passou**, frontend e backend empacotados. |
| `prettier --check` | **Passou** nos arquivos alterados. |
| `git diff --check` | **Passou**, sem whitespace inválido. |
| Teste de execução | Sucesso por polling, resposta final vazia e timeout total cobertos deterministicamente. |
| Varredura de segredos | Nenhuma chave ou token foi adicionado ao diff. |

O build ainda emite o aviso preexistente de chunks frontend superiores a 500 kB. Isso permanece como trabalho posterior de divisão de código e carregamento sob demanda.

## Pendências para homologação

A migração `0011` precisa ser aplicada ao banco do ambiente publicado antes do deploy desta versão. O endpoint público não foi alterado nesta sessão e a aplicação publicada não foi homologada ponta a ponta porque a verificação de saúde expirou sem resposta. Depois do deploy, o aceite mínimo é executar uma pergunta autenticada e confirmar, no banco/log, o mesmo `request_id` em `agent_runs`, em `agent_run_events`, no provider, nos MCPs consultados e na resposta final.

A execução assíncrona atualmente mantém o trabalho subjacente até o timeout individual da chamada em curso; o estado do usuário, porém, é encerrado no limite total e não volta a spinner indefinidamente. Cancelamento cooperativo por `AbortSignal` pode ser refinado em uma etapa posterior se o ambiente exigir interrupção imediata de requests caros.

## Decisão para a próxima fase

A Fase 0 está pronta para revisão. Recomenda-se parar aqui para aprovação, aplicar a migração e fazer um deploy controlado. A Fase 1 deve usar o request ID e os eventos agora disponíveis para executar a bateria de perguntas de leitura na obra fictícia e em uma obra de homologação, sem liberar mutações.
