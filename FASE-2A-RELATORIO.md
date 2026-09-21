# Fase 2A — Fonte local de evidências

**Data:** 20 de setembro de 2026  
**Base:** `7850a02` — plano de evolução do cérebro de obras  
**Estado:** checkpoint concluído; integração com o orquestrador ainda pendente.

## Resultado

Foi criada uma camada somente leitura para representar evidências de EAP e Cronograma com contratos independentes da origem dos dados. A implementação lê o banco local por Drizzle e oferece um roteador `local-first` preparado para receber um adaptador MCP como fallback.

## Arquivos criados

```text
server/construction/domain-types.ts
server/construction/evidence-source.ts
server/construction/local-database-source.ts
server/construction/evidence-router.ts
server/construction/evidence-source.test.ts
server/construction/evidence-router.test.ts
```

## Contratos implementados

A camada suporta:

- árvore EAP;
- consulta de nó EAP por código, `externalId` ou `externalUid`;
- atividades do cronograma;
- dependências do cronograma;
- avisos de obra vazia;
- erros estruturados de banco indisponível;
- origem explícita da evidência;
- fallback quando a fonte local não possui dados suficientes.

A fonte local usa as tabelas existentes `wbs_nodes`, `schedule_activities` e `schedule_dependencies`. Nenhuma migração foi criada e nenhum dado foi alterado.

## Validação

| Verificação               | Resultado                                                  |
| ------------------------- | ---------------------------------------------------------- |
| `pnpm check`              | Passou                                                     |
| `pnpm test`               | 44 testes passaram em 11 arquivos                          |
| `pnpm build`              | Passou                                                     |
| Prettier                  | Passou nos arquivos da camada                              |
| Banco real                | Não acessado nesta entrega; testes usam leitores simulados |
| Frontend/agente principal | Não alterado                                               |
| Mutação de dados          | Nenhuma                                                    |

## Limitação conhecida

O `EvidenceSourceRouter` já permite fonte local e fallback, mas ainda não foi conectado ao `runProjectOrchestrator`. Portanto, o teste real do frontend ainda segue usando o caminho atual. Essa separação foi intencional para preservar rollback e facilitar testes.

## Próximo ponto de continuação

A próxima entrega deve:

1. criar um adaptador MCP que implemente o mesmo contrato;
2. conectar o roteador ao contexto do agente em modo `local_first`;
3. incluir no contexto a fonte, avisos e erros de evidência;
4. adicionar regressão do orquestrador para banco local disponível e MCP indisponível;
5. executar a bateria determinística sem alterar o frontend.

O trabalho deve continuar a partir do commit desta entrega, sem reabrir a implementação dos tipos ou do leitor local salvo se os testes de integração encontrarem incompatibilidade.
