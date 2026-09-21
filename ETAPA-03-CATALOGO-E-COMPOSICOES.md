# Etapa 3 — Catálogo de preços e composições

**Data:** 21 de setembro de 2026  
**Status:** concluída  
**Objetivo:** criar uma base versionada para fontes de preços, itens de custo e composições de serviço.

## O que foi concluído

A plataforma agora possui catálogos de preços independentes. Cada catálogo registra nome, tipo de fonte, UF, período de referência, estado, observações e autor. Os tipos previstos são base própria, SINAPI, SEINFRA e fornecedor.

Cada catálogo pode receber itens de preço. Um item possui código, descrição, unidade, tipo, preço unitário e observações. O tipo diferencia material, mão de obra, equipamento e serviço. O cadastro conserva o preço como referência do catálogo e não altera automaticamente os orçamentos existentes.

Também foram criadas composições de serviço. Uma composição possui código, descrição, unidade, catálogo de origem, período de referência e estado. Seus componentes apontam para itens de preço e armazenam coeficiente, tipo e uma cópia do preço unitário no momento da associação.

A cópia do preço é importante para preservar a memória de cálculo. Se uma fonte receber uma atualização no futuro, a composição antiga continuará explicando o custo que foi utilizado naquele momento.

O backend recebeu operações protegidas para consultar catálogos, itens, composições e componentes. Também foram adicionadas mutações para criar uma fonte, cadastrar item, criar composição e adicionar componente. O custo unitário é calculado deterministicamente como a soma de coeficiente multiplicado pelo preço congelado.

A interface recebeu a seção **Catálogo** na navegação principal. A tela contém resumo de quantidade de catálogos, itens e custo unitário. Também apresenta formulários profissionais para criar fonte, item, composição e componente. A interface diferencia claramente fonte, período, unidade, tipo de insumo, coeficiente e custo calculado.

A migração `0013_parched_owl.sql` foi gerada para criar as quatro tabelas da etapa. O fluxo de deploy já executa `pnpm db:push`, preservando o banco existente e aplicando somente as novas estruturas.

## Arquivos principais

| Arquivo | Alteração |
|---|---|
| `drizzle/schema.ts` | Entidades de catálogos, itens, composições e componentes. |
| `drizzle/0013_parched_owl.sql` | Migração SQL da Etapa 3. |
| `server/routers.ts` | Namespace `catalog` com consultas e mutações. |
| `client/src/components/CatalogView.tsx` | Interface profissional do catálogo e das composições. |
| `client/src/pages/Home.tsx` | Navegação e montagem da seção Catálogo. |
| `client/src/index.css` | Layout, formulários, listas e responsividade da etapa. |

## Validação

A etapa passou em `pnpm check`, `pnpm test --run`, `pnpm build` e `git diff --check`. O TypeScript passou. A suíte possui 16 arquivos e 66 testes aprovados. O build de produção foi concluído. O bundler ainda informa o aviso de chunks maiores que 500 kB, que permanece como item separado de performance.

## O que ainda falta

A importação de arquivos CSV/XLSX ainda não foi implementada. Nesta etapa a fonte, o período e os itens são cadastrados pela interface para validar o modelo de negócio. A importação será adicionada depois com validação de colunas, prévia, rejeição de duplicados e relatório de erros.

Ainda falta associar um item de preço a uma composição por código de origem, importar composições oficiais completas, comparar versões de catálogos e bloquear alterações em composições validadas. Também falta aplicar uma composição diretamente a um item do orçamento, substituindo o preço digitado por um custo unitário calculado com rastreabilidade.

SINAPI e SEINFRA aparecem como tipos de fonte, mas o sistema ainda não baixa nem consulta automaticamente essas bases. Essa decisão foi intencional: primeiro foi criado o contrato interno para depois acoplar arquivos oficiais ou conectores autorizados sem comprometer a integridade do orçamento.

## Próxima etapa

A Etapa 4 será **Aplicação de composição ao orçamento e planejamento quantitativo**. Ela deverá permitir selecionar uma composição para um serviço orçado, copiar o custo unitário calculado, mostrar a memória de cálculo e relacionar o serviço à EAP. Depois disso, o planejamento poderá usar quantidade, produtividade e recursos para derivar duração e custo planejado.

## Commit

A entrega será versionada no GitHub com a mensagem `feat: add price catalogs and compositions`.

## Referências

[1]: ./PLANO-MESTRE-CONTROLE-OBRAS.md "Plano mestre de domínio e controle de obras"

[2]: ./ETAPA-02-ORCAMENTO-E-SERVICOS.md "Etapa 2 — Orçamento e serviços"
