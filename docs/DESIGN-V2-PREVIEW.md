# Plataforma Obras — proposta de interface V2 (protótipo isolado)

## Objetivo
Reduzir densidade visual **sem alterar a engenharia**. EAP é a fonte de organização;
cronograma, atividades, versões, dependências e aprovações continuam seguindo o backend real
quando a integração vier a ser feita. Neste protótipo, nada calcula CPM ou congela baseline.

## Escopo implementado
- Menu de seis itens: Visão geral, Planejamento, Execução, Custos, Documentos e Configurações.
- Obra ativa sem seletor de outras obras dentro do contexto; a saída leva ao portfólio separado.
- Dashboard: quatro métricas, próxima ação, sequência do planejamento, mini cronograma, alertas.
- Planejamento: árvore da EAP (expansível e pesquisável), Gantt (seleção, filtro e referência),
  dependências simplificadas e comparação entre versões simuladas.
- Detalhe de atividade em painel lateral: edição em memória de nome, descrição, responsável,
  duração e avanço; o resultado dura apenas até recarregar a página.
- Tema claro/escuro, visualização adaptada a notebook/tablet, estados vazios.
- Paleta neutra, uma ação principal por contexto, status com texto e cor.
- Os dados são **fictícios** e identificados claramente na interface.

## Como executar sem tocar no sistema atual
Na raiz do repositório, no branch de design:

    pnpm install --frozen-lockfile
    pnpm exec vite --config vite.design-v2.config.ts

Abrir: http://127.0.0.1:5182/design-v2.html

Para gerar um build isolado:

    pnpm exec vite build --config vite.design-v2.config.ts

Saída: dist/design-v2/ — **não** dist/public/.

## Limites de segurança
- Não importamos o App, Auth, tRPC, Drizzle, Supabase ou os módulos produtivos.
- Não há token, chave, cookie, login, API ou gravação remota nos componentes.
- Não são importados CSS da aplicação principal nem os serviços de produção.
- O sistema atual continua em client/index.html e em client/src/main.tsx.
- A entrada HTML de design é independente e não participa do build padrão do Render.
- Esta branch não deve ser mesclada na main antes da aprovação formal e plano de migração.

## Etapas propostas para migração futura (se aprovada)
1. Validar hierarquia visual, teclado, acessibilidade, tablet e notebook.
2. Definir contratos de leitura da visão global com os endpoints existentes.
3. Integrar EAP e versões **sem alterar regras de negócio**, com testes de regressão.
4. Integrar motor de atividades/CPM e desenhar estados de erro/persistência.
5. Migrar somente um módulo por vez, atrás de flag; rollback garantido.
6. Retirar telas antigas **apenas após equivalência funcional comprovada**.

## Remoções planejadas
- Remover da tela inicial: listas integrais, múltiplos CTAs, menus redundantes.
- Tirar atributos técnicos extensos da árvore EAP; detalhes ficam no inspetor.
- Retirar excesso de colunas do cronograma; detalhes ficam no painel de atividade.
- Exibir bloqueios uma vez no topo do contexto de planejamento, com caminho de correção.
- Agrupar módulos relacionados; preservar as funcionalidades, não eliminá-las.

## Critérios de aceite
- Zero efeito sobre a main, o Render e o Supabase.
- Sem rede/autenticação necessária para mostrar a prévia.
- Funciona com 1280x800 e 768x1024, com menu adaptativo.
- Menu <= 6 itens; no máximo uma ação primária em cada área principal.
- Campos editáveis e toggles têm comportamento demonstrável e identificado como fictício.
- Build, typecheck e smoke Playwright da prévia aprovados antes da avaliação visual.
