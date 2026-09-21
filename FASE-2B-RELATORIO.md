# Fase 2B — Contexto local no agente

**Data:** 20 de setembro de 2026  
**Base:** `1fe493e` — fonte local de evidências  
**Estado:** checkpoint concluído; adaptador de respostas MCP no contrato comum permanece como próximo incremento.

## Resultado

O fluxo autenticado `agent.chat` agora coleta, em modo somente leitura, a árvore EAP, as atividades e as dependências do banco local antes de iniciar a execução assíncrona. O resumo é incluído no contexto do orquestrador para que o modelo saiba a fonte, a quantidade de registros e as lacunas operacionais.

O agente ainda mantém suas ferramentas MCP somente leitura. Nenhuma ferramenta MCP foi removida e nenhuma mutação foi liberada.

## Alterações

- `AgentProjectContext` passou a aceitar resumo estruturado de evidências.
- `buildAgentProjectContext` passou a receber esse resumo opcional.
- `agent.chat` consulta a fonte local em paralelo.
- O prompt do orquestrador exibe:
  - fonte da evidência;
  - quantidade de nós EAP;
  - quantidade de atividades;
  - quantidade de dependências;
  - avisos;
  - erros estruturados.
- Foi adicionada regressão que verifica que a fonte local e as falhas de evidência chegam ao modelo.

## Validação

| Verificação           | Resultado                                 |
| --------------------- | ----------------------------------------- |
| `pnpm check`          | Passou                                    |
| `pnpm test`           | 45 testes passaram em 11 arquivos         |
| Teste do orquestrador | Passou com 6 casos                        |
| `pnpm build`          | Passou                                    |
| Prettier              | Passou                                    |
| Banco produtivo       | Não alterado                              |
| MCPs                  | Mantidos como ferramentas somente leitura |
| Mutação               | Nenhuma                                   |
| Deploy                | Não executado                             |

## Limitação conhecida

A fonte local já alimenta o contexto do agente, mas as respostas estruturadas dos MCPs ainda não são convertidas para o mesmo modelo de evidência. O próximo incremento deve criar esse adaptador e usar o roteador local-first para decidir quando consultar o MCP.

## Próximo ponto de continuação

Continuar criando `mcp-evidence-source.ts` com o contrato de `EvidenceSource`. O adaptador deve receber uma função de chamada injetável, mapear `structuredContent` dos MCPs para os tipos de EAP, atividades e dependências e preservar erros sem transformar falhas em listas vazias.

Depois, adicionar testes com os payloads existentes em `scripts/e2e-fictitious.ts` e somente então ligar o fallback ao roteador.
