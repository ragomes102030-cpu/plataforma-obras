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

## Integração real V2 — sem mudança de dados

A PR contém uma moldura V2 conectada aos módulos existentes, além da prévia fictícia. É uma versão visual opcional.

1. Executar a branch de design em ambiente isolado.
2. Autenticar e abrir uma obra existente.
3. Adicionar `?ui=v2` à URL `/obra/ID`.
4. Remover `?ui=v2` e recarregar para voltar à interface clássica.

**Atenção:** a V2 real não é sandbox: os comandos existentes continuam gravando no mesmo banco. Apenas a prévia fictícia em `design-v2.html` é livre de API. Testar navegação em leitura; qualquer operação mutável só na AURORA TESTE.

### Cobertura integral

| Área | Abas reais |
| --- | --- |
| Visão geral | dashboard |
| Planejamento | escopo, eap, atividades, dependencias, cpm, baseline, gantt, linha-balanco |
| Execução | producao, curva-s |
| Custos | financeiro |
| Suprimentos | suprimentos, catalogo |
| Gestão | documentos, riscos |
| Ferramenta administrativa | comando (admin-only) |

**17 de 17 abas**. Assistente flutuante, lixeira, seleção de obras e regras de permissão permanecem.

### Implementação
- `client/src/modules/navegacao-v2.ts`: organização dos mesmos IDs reais em seis áreas.
- `client/src/pages/Home.tsx`: altera apenas a moldura e a navegação mediante opt-in. Os componentes, hooks tRPC, comandos e cálculos permanecem.
- `client/src/design-v2/live-shell.css`: CSS escopado ao modo V2.
- `client/src/main.tsx`: importa CSS após os estilos atuais.
- `client/src/modules/navegacao-v2.test.ts`: audita a correspondência de 17/17 abas.

### Condições antes de qualquer merge ou publicação
- Testes, TypeScript e build aprovados.
- Conferência das 17 telas em notebook/tablet com autenticação, inicialmente só leitura.
- Conferir permissões (inclusive Central de Comando) e persistência após navegação.
- Testes que escrevem dados exclusivamente na AURORA TESTE, com aprovação específica.
- **Sem merge na main ou deploy no Render até validação e autorização.**

### Escopo atual
A moldura e a navegação reais são remodeladas; os conteúdos internos das 17 telas ainda preservam sua densidade original. A simplificação das tabelas será incremental, com modo essencial/avançado, sem esconder recursos técnicos. O modo escuro já funciona no mock, mas não foi aplicado às planilhas reais para não comprometer legibilidade.
