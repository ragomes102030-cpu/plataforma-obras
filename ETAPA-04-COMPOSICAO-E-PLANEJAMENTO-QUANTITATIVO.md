# Etapa 4 — Aplicação de composição e planejamento quantitativo

**Data:** 21 de setembro de 2026  
**Status:** concluída  
**Objetivo:** conectar o catálogo de composições ao orçamento e iniciar o planejamento quantitativo de serviços.

## O que foi concluído

Os itens de orçamento agora podem registrar a composição utilizada, o custo unitário calculado, a produtividade e a duração planejada. A estrutura preserva tanto o preço aplicado quanto a referência da composição, permitindo explicar de onde veio o custo.

Ao cadastrar um serviço, o usuário pode escolher uma composição existente. O backend lê os componentes da composição e calcula o custo unitário como a soma de coeficiente multiplicado pelo preço congelado de cada componente. Quando uma composição é aplicada, o preço informado manualmente deixa de ser a fonte principal do cálculo.

A composição precisa possuir pelo menos um componente. O sistema bloqueia a aplicação de uma composição vazia. Também bloqueia o cadastro em versões de orçamento aprovadas ou arquivadas, preservando a governança iniciada nas etapas anteriores.

O cadastro de serviço recebeu produtividade e duração planejada. Quando a produtividade é informada, a duração é calculada deterministicamente pela fórmula:

```text
duração = teto(quantidade planejada / produtividade)
```

A duração manual continua disponível quando ainda não existe produtividade de referência. Essa distinção fica registrada no item para que uma etapa posterior possa revisar a origem do prazo.

A interface do orçamento recebeu seleção de composição, produtividade e duração. O rodapé do formulário informa quando o custo será calculado pela memória de componentes. A tabela passou a mostrar a composição aplicada, o total do serviço e a duração planejada.

Foi criada a migração `0014_sturdy_captain_midlands.sql` com os campos adicionais da tabela `budget_items`. O deploy do Render executa `pnpm db:push` antes do build e aplicará a alteração no banco existente.

## Arquivos principais

| Arquivo | Alteração |
|---|---|
| `drizzle/schema.ts` | Campos de composição, custo congelado, produtividade e duração em `budget_items`. |
| `drizzle/0014_sturdy_captain_midlands.sql` | Migração da Etapa 4. |
| `server/routers.ts` | Cálculo de composição e duração na criação de serviço. |
| `client/src/components/BudgetView.tsx` | Seleção de composição e planejamento quantitativo no formulário e na tabela. |

## Validação

A etapa passou em `pnpm check`, `pnpm test --run`, `pnpm build` e `git diff --check`. O TypeScript passou. A suíte possui 16 arquivos e 66 testes aprovados. O build foi concluído. O aviso de chunks maiores que 500 kB continua separado como tarefa de performance.

## O que ainda falta

A aplicação de composição está disponível no cadastro de novos serviços, mas ainda não existe uma ação de reaplicação em um item já cadastrado. Também falta exibir a lista detalhada dos componentes diretamente na tabela do orçamento e permitir abrir a memória de cálculo sem sair da tela.

A produtividade ainda é informada manualmente. Falta relacioná-la ao recurso, equipe, frente, calendário e capacidade diária. A duração calculada ainda não atualiza automaticamente as atividades do cronograma.

O vínculo com a EAP continua opcional no formulário. A próxima evolução deverá exigir um vínculo válido para os serviços que entrarem no planejamento aprovado. Também falta distribuir quantidades por período e frente.

## Próxima etapa

A Etapa 5 será **Planejamento físico, recursos e rede de precedências**. Ela deverá usar os serviços orçados para criar atividades planejadas, relacionar frentes e equipes, definir predecessoras, calcular duração a partir de produtividade e preparar o caminho crítico.

## Commit

A entrega será versionada no GitHub com a mensagem `feat: apply compositions to budget planning`.

## Referências

[1]: ./PLANO-MESTRE-CONTROLE-OBRAS.md "Plano mestre de domínio e controle de obras"

[2]: ./ETAPA-03-CATALOGO-E-COMPOSICOES.md "Etapa 3 — Catálogo de preços e composições"
