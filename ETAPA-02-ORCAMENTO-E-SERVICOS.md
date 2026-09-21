# Etapa 2 — Orçamento e serviços

**Data:** 21 de setembro de 2026  
**Status:** concluída  
**Objetivo:** criar o primeiro núcleo real de orçamento, com persistência, versões, cadastro de serviços e interface profissional.

## O que foi concluído

A plataforma agora possui duas entidades persistentes para o orçamento. `budget_versions` representa versões independentes por obra, com nome, número, estado, moeda, observações, autor e datas. `budget_items` representa os serviços da versão, com código, descrição, unidade, quantidade, preço unitário, fonte, referência temporal e vínculo opcional com a EAP.

A versão de orçamento protege o histórico. Uma nova versão recebe numeração sequencial e inicia como rascunho. Itens não podem ser adicionados a uma versão aprovada ou arquivada. A primeira entrega ainda não altera automaticamente preços externos e não sobrescreve uma versão existente.

O backend recebeu o namespace `budgets`, com consulta da versão ativa, itens e total direto. Também foram adicionadas as mutações para criar uma versão e cadastrar um serviço. O total é calculado de forma determinística pela soma de quantidade multiplicada pelo preço unitário.

A interface recebeu um módulo próprio de Orçamento na navegação principal. A tela apresenta a versão ativa, quantidade de itens e total direto. Quando não há versão, orienta o usuário a criar a primeira. Quando há versão, oferece um formulário profissional para cadastrar código, descrição, unidade, quantidade, preço unitário, vínculo com a EAP, fonte e período de referência.

A composição cadastrada é apresentada em tabela com total por serviço. A interface também exibe estados vazios, carregamento, atualização manual e erros de persistência. O layout foi preparado para telas menores sem perder a leitura da tabela.

A migração `0012_clear_banshee.sql` foi gerada para criar as tabelas no banco existente. O deploy do Render executa `pnpm db:push` antes do build, portanto a estrutura será aplicada sem trocar a base de dados configurada.

## Arquivos principais

| Arquivo | Alteração |
|---|---|
| `drizzle/schema.ts` | Entidades `budget_versions` e `budget_items`. |
| `drizzle/0012_clear_banshee.sql` | Migração SQL da Etapa 2. |
| `server/routers.ts` | Consultas e mutações do namespace `budgets`. |
| `client/src/components/BudgetView.tsx` | Interface profissional de orçamento e serviços. |
| `client/src/pages/Home.tsx` | Navegação e montagem do módulo Orçamento. |
| `client/src/index.css` | Cartões, formulário, tabela e responsividade do módulo. |

## Validação

A etapa passou em `pnpm check`, `pnpm test --run`, `pnpm build` e `git diff --check`. O TypeScript passou. A suíte possui 16 arquivos e 66 testes aprovados. O build de produção foi concluído. O bundler ainda informa o aviso preexistente de chunks maiores que 500 kB; esse aviso não bloqueia a entrega e será tratado em uma etapa própria de performance.

## O que ainda falta

Esta etapa não é ainda um orçamento completo. Ainda faltam edição e exclusão controladas de itens, aprovação e reabertura de versões, subtotal por grupo, custo indireto, encargos, BDI, composição detalhada de insumos, mão de obra e equipamentos, importação CSV/XLSX, histórico de alterações e comparação entre versões.

Também falta o vínculo obrigatório entre serviços e EAP. Nesta primeira entrega ele é opcional para permitir iniciar o orçamento antes da EAP estar completa. A regra deverá ser endurecida quando o fluxo de planejamento quantitativo for implementado.

SINAPI e SEINFRA ainda não são consultados automaticamente. O campo de fonte e período foi criado para preservar esse contexto. A próxima evolução deverá criar o catálogo de fontes e a importação validada de arquivos oficiais, sem alterar orçamentos aprovados.

## Próxima etapa

A Etapa 3 será **Composições e catálogo de preços**. Ela deverá permitir importar ou cadastrar uma composição, associar insumos, mão de obra e equipamentos, calcular o custo unitário e selecionar a fonte de referência. O sistema deverá diferenciar composição própria, SINAPI, SEINFRA e preço negociado.

Depois da Etapa 3, o orçamento estará pronto para alimentar o planejamento quantitativo, com serviços vinculados à EAP, produtividade, recursos e duração.

## Commit

A entrega será versionada no GitHub com a mensagem `feat: add budget and service foundation`.

## Referências

[1]: ./PLANO-MESTRE-CONTROLE-OBRAS.md "Plano mestre de domínio e controle de obras"

[2]: ./ETAPA-01-INTERFACE-PROFISSIONAL.md "Etapa 1 — Fundação da interface profissional"
