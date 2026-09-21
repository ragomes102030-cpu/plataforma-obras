# Fase 3A — Validadores determinísticos e CPM

**Data:** 20 de setembro de 2026  
**Base:** `d0214f6` — Fase 3 liberada  
**Estado:** checkpoint concluído e auditado.

## Resultado

A primeira entrega da Fase 3 criou validadores determinísticos independentes da LLM para EAP, dependências e CPM.

### Validador de EAP

O `validateEap` detecta IDs duplicados, códigos duplicados, nomes vazios, nós órfãos e ciclos na hierarquia.

### Validador de dependências

O `validateDependencies` detecta atividades inexistentes, auto dependências, ciclos, lag não inteiro, dependências cruzando projetos e registros de dependência cujo `projectId` não corresponde às atividades.

### CPM determinístico

O `calculateDeterministicCpm` valida a rede antes de chamar o calculador. Quando a rede é válida, calcula início e término cedo, início e término tarde, folga, duração do projeto e caminho crítico.

Durante a auditoria foi encontrado e corrigido um erro existente na relação **SF** do calculador compartilhado: o cálculo usava o término da predecessora quando deveria usar o início da predecessora.

## Testes adicionados

- EAP válida com pai e filho.
- EAP órfã e código duplicado.
- Ciclo hierárquico.
- Rede de dependências linear.
- Atividade inexistente e auto dependência.
- Ciclo e dependência cruzando projetos.
- CPM linear.
- CPM paralelo com folga.
- CPM com ciclo.
- Relação FF com lag.
- Relação SF corrigida.

## Auditoria

| Verificação        | Resultado                             |
| ------------------ | ------------------------------------- |
| `pnpm check`       | Passou                                |
| `pnpm test`        | **61 testes passaram em 15 arquivos** |
| `pnpm build`       | Passou                                |
| Prettier           | Passou após correção final            |
| `git diff --check` | Passou                                |
| Banco              | Não alterado                          |
| LLM/orquestrador   | Não conectado nesta etapa             |
| Mutação            | Nenhuma                               |
| Deploy             | Não executado                         |

O build continua exibindo somente o aviso preexistente de chunks frontend acima de 500 kB.

## Limitações conhecidas

O resultado determinístico ainda não está integrado ao contexto do agente. Também não foram implementados calendário, feriados, unidades de produção, validação quantitativa entre EAP e atividades ou relações de precedência com calendários reais.

A próxima etapa deve expor os resultados dos validadores em modo somente leitura para o orquestrador, sem permitir que a LLM substitua o cálculo.

## Próximo ponto de continuação

1. Criar um contrato de `ConstructionValidationSnapshot`.
2. Executar EAP, dependências e CPM a partir das evidências locais/MCP já normalizadas.
3. Incluir bloqueadores e advertências no resumo de evidências do agente.
4. Adicionar regressão no orquestrador garantindo que uma rede inválida seja apresentada como lacuna/bloqueio, nunca como cronograma aprovado.
5. Não criar tabelas novas nem liberar mutações nesta continuação.
