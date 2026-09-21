# Fase 2C — Adaptador MCP e fallback local-first

**Data:** 20 de setembro de 2026  
**Base:** `dded6e5` — contexto local no agente  
**Estado:** concluída e auditada.

## Resultado

Foi criado o adaptador `McpEvidenceSource`, que implementa o mesmo contrato da fonte local e converte respostas estruturadas dos MCPs para os modelos comuns de EAP, atividades e dependências.

O fluxo `agent.chat` passou a usar `EvidenceSourceRouter` com a política `local-first`:

1. consulta o banco local;
2. usa o MCP somente quando a fonte local está vazia ou indisponível;
3. preserva a origem da evidência;
4. preserva falhas locais e MCP simultaneamente;
5. nunca converte HTTP 502 em lista vazia silenciosa.

## Alterações principais

- `McpEvidenceSource` para EAP e Cronograma.
- `ConstructionMcpEvidenceSource` para selecionar o vínculo externo por domínio.
- Normalização de:
  - árvores hierárquicas da EAP;
  - referências `eap_id` e `uid`;
  - atividades e durações;
  - dependências `TI`, `II`, `TT` e `IT` para `FS`, `SS`, `FF` e `SF`;
  - `lag` de dependências.
- Preservação de identificadores externos como strings.
- Erros específicos para MCP EAP indisponível, Cronograma indisponível e vínculo externo ausente.
- Roteador corrigido para retornar origem `local_db+mcp` quando ambas as fontes falham.

## Auditoria

| Verificação             | Resultado                         |
| ----------------------- | --------------------------------- |
| `pnpm check`            | Passou                            |
| `pnpm test`             | 50 testes passaram em 12 arquivos |
| Testes do adaptador MCP | 4 passaram                        |
| Testes do roteador      | 4 passaram                        |
| `pnpm build`            | Passou                            |
| Prettier                | Passou                            |
| `git diff --check`      | Passou antes do commit            |
| HTTP 502                | Preservado como erro estruturado  |
| Mutação de dados        | Nenhuma                           |
| Migração de banco       | Nenhuma                           |
| Deploy                  | Não executado                     |
| Segredos                | Nenhum adicionado                 |

O build continua exibindo apenas o aviso preexistente de chunks frontend acima de 500 kB; não houve falha de compilação.

## Limitação conhecida

O contexto local enviado ao orquestrador contém contagens, fonte, avisos e erros. A árvore EAP completa e o conjunto completo de dependências continuam disponíveis por consultas de ferramenta, em vez de serem duplicados integralmente no prompt. Essa decisão evita aumentar o contexto e mantém o agente capaz de consultar detalhes sob demanda.

A adaptação está implementada para EAP e Cronograma. O domínio Gantt/LOB continua fora do fallback estruturado porque depende de semântica de representação e produção que será tratada depois dos validadores determinísticos.

## Próximo ponto de continuação

A Fase 2 está liberada. A próxima execução deve iniciar a **Fase 3 — validações determinísticas e CPM**:

1. criar testes de grafo antes dos calculadores;
2. implementar validação estrutural da EAP;
3. implementar validação de dependências, incluindo ciclos e cruzamento de projetos;
4. implementar CPM com folgas e caminho crítico;
5. manter a LLM apenas como explicadora do resultado calculado.

Não iniciar escrita, baseline, outbox ou sincronização externa antes dos testes determinísticos da Fase 3 passarem.
