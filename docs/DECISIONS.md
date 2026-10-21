# Decisões de Arquitetura

Última atualização: 19/10/2026

> Decisões 1 e 2 estão **substituídas** pelas decisões 16 e 17 (abaixo). Elas ficam
> registradas porque explicam o caminho, não porque valem hoje. A stack em vigor
> está em [STACK-ATUAL.md](STACK-ATUAL.md).

---

## Decisão 1: Vercel vs Render — **SUBSTITUÍDA pela Decisão 17**

- **Decisão:** Vercel para frontend
- **Quando:** Setembro 2026
- **Por quê:**
  - Edge Network → melhor performance para SPA
  - Sem cold start do Render free tier (gantt/LOB travaram)
  - Integração nativa com GitHub (auto-deploy)
  - Build Vite nativo, sem adaptação
- **Impacto:** Frontend 4x mais rápido, deploy automático via git push

### Alternativas consideradas
- Render: free tier tava com problemas de linha de balanço e gantt
- Netlify: similar ao Vercel mas já investido no Vercel

---

## Decisão 2: Aiven para banco de dados — **SUBSTITUÍDA pela Decisão 16**

- **Decisão:** MySQL 8 em Aiven
- **Quando:** Setembro 2026
- **Por quê:**
  - Plano gratuito disponível (grátis para validação)
  - SSL obrigatório (produção segura desde o início)
  - MySQL compatível com Drizzle ORM
  - PostGIS disponível se precisar de GIS no futuro
- **Impacto:** Banco cloud sem custo inicial

### Alternativas consideradas
- PostgreSQL no Aiven: também disponível, mas MySQL já funcionando
- Railway: similar mas já investido no Aiven

---

## Decisão 3: pnpm workspace monorepo

- **Decisão:** Manter estrutura monorepo existente
- **Quando:** Setembro 2026
- **Por quê:**
  - Já estava funcionando
  - pnpm economiza espaço (content-addressable store)
  - build script já configurado corretamente
- **Impacto:** Sem mudança, manutenção da estrutura existente

### Alternativas consideradas
- Separar em repositórios: mais complexidade de CI/CD sem benefício claro

---

## Decisão 4: tRPC para API

- **Decisão:** tRPC (já existente no projeto)
- **Quando:** Já estava no projeto quando iniciado
- **Por quê:**
  - Type-safe entre frontend e backend
  - Sem necessity de OpenAPI/Swagger
  - Integração natural com React Query
- **Impacto:** Desenvolvimento mais rápido, menos bugs de tipo

---

## Decisão 5: MCP servers mistos (stdio + SSE + HTTP)

- **Decisão:** Manter misto conforme necessidade
- **Quando:** Setembro 2026
- **Por quê:**
  - stdio para MCPs locais (excel, whatsapp, lean-planning)
  - SSE/HTTP para MCPs remotos (cronograma, eap, gantt via Vercel)
  - Compatibilidade com AionUi e plataforma-obra existente
- **Impacto:** Flexibilidade para integrar diferentes tipos de serviço

---

## Decisão 6: Vite + React para frontend

- **Decisão:** Manter Vite + React (já existente)
- **Quando:** Já estava no projeto
- **Por quê:**
  - SPA performática
  - Componentes Radix UI + TailwindCSS já configurados
  - Build rápido
- **Impacto:** Frontend moderno e performático

### Alternativas consideradas
- Next.js: não necessário para SPA simples, Vercel suporta Vite nativamente

---

## Decisão 7: Composio para integrações externas

- **Decisão:** Usar Composio MCP para 1500+ integrações
- **Quando:** Setembro 2026
- **Por quê:**
  - Acesso a Slack, Google, Notion, HubSpot, etc.
  - Base de conhecimento e automação externa
  - A chave da Composio nunca pertenceu a este arquivo. Ela estava aqui em texto
    puro desde o commit `ecc1a05`, e o repositório passou a ser público. Um
    segredo em commit não some de longe: some do arquivo e fica no histórico.
    O token que estava aqui foi revogado — a Composio responde 410 —, o que
    encerra o risco, mas não justifica o que ele fazia num repositório. Chave em
    variável de ambiente, sempre.
- **Impacto:** Agentes podem interagir com ferramentas externas

---

## Decisão 8: Hermes Agent + AionUi como orquestrador

- **Decisão:** Hermes Agent via ACP
- **Quando:** Já configurado
- **Por quê:**
  - Multi-agente: vários agentes podem usar as mesmas ferramentas
  - Skills instalados no ecossistema (270 skills)
  - MCP servers centralizados no SQLite
- **Modelo:** upstage/solar-pro4:free via provider nous
- **Impacto:** Sistema multi-agente com acesso a todo o ecossistema

---

## Decisão 9: Base de conhecimento no projeto

- **Decisão:** Criar /docs/ no projeto para documentação
- **Quando:** Setembro 2026
- **Por quê:**
  - Versionada no Git
  - Sem necessidade de ferramenta externa
  - Acessível para qualquer agente que clone o projeto
- **Impacto:** Agentes que abrem o projeto sabem como ele funciona

### Alternativas consideradas
- Notion: também possível via Composio, mas Git já cobre

---

## Ações pendentes (decisões esperadas)

| Decisão | Quando |
|---|---|
| Escolher ferramentas para autodesk/linear/clickup | Quando tokens disponíveis |
| Configurar CI/CD automatizado com GitHub Actions | Próxima semana |
| Integrar Notion via Composio para base de conhecimento | Quando necessário |


## Decisão 10: Contrato único do MCP EAP para o Arquimedes
- **Decisão:** O catálogo do Arquimedes deve refletir o contrato real publicado pelo MCP EAP, sem lista paralela incompleta.
- **Regra:** toda ferramenta publicada deve ser classificada como somente leitura ou mutação; mutações seguem confirmação explícita antes da execução.
- **Validação:** mudanças no contrato exigem comparação 1:1 com o servidor e teste de regressão no orquestrador.
- **Escopo:** a EAP deve fechar o ciclo escopo → proposta → estrutura → dicionário → cobertura 100% → aprovação → aplicação → revalidação.
- **Data:** 03/10/2026.


## Decisão 11: Persistir e reidratar a conversa do Arquimedes sem aplicar propostas

- **Decisão:** Recuperar a conversa do agente a partir das execuções persistidas, separada do estado estrutural aprovado da obra.
- **Quando:** Outubro de 2026
- **Motivo:** A janela do Arquimedes mantinha o histórico apenas em memória do navegador; ao reabrir, a conversa desaparecia.
- **Regra:** recuperar conversa/proposta nunca aplica EAP, cronograma ou outra mutação. A proposta continua sujeita a revisão e confirmação explícita.
- **Segurança:** a recuperação valida usuário e obra antes de retornar o histórico.
- **Regressão:** fechar e reabrir o agente deve preservar o contexto necessário para continuar a revisão da proposta.

## Decisão 12: Reconsultar o histórico ao reabrir o Arquimedes

- **Decisão:** A UI do Arquimedes deve reconsultar `agent.history` sempre que a janela for aberta/reaberta e após uma execução terminar.
- **Motivo:** Persistir a conversa no banco não é suficiente quando o componente permanece montado e apenas sua visibilidade muda.
- **Regra:** fechar/reabrir a janela não pode iniciar uma nova conversa vazia; deve reidratar o contexto persistido da obra/usuário.
- **Segurança:** a recuperação continua somente leitura e separada das mutações da obra.
- **Regressão:** o fluxo obrigatório é enviar uma mensagem, receber a resposta, fechar a janela, reabrir e verificar a reapresentação da conversa.
- **Data:** 03/10/2026.



## Decisão 13: O backend é a última barreira do contexto conversacional

- **Decisão:** O próximo `agent.chat` deve recuperar o histórico persistido da obra/usuário no backend antes de chamar o orquestrador.
- **Motivo:** estado React, reidratação visual e persistência em `agent_runs` não podem ser tratados como garantia de que o LLM receberá o contexto anterior.
- **Regra:** mensagens persistidas e mensagens recebidas da UI são mescladas por sobreposição; mensagens duplicadas não são reenviadas; o contexto final respeita o limite de 20 mensagens.
- **Segurança:** esta recuperação é somente leitura e não aplica nenhuma proposta ou mutação na obra.
- **Regressão:** deve existir cobertura para UI sem histórico e UI já reidratada.
- **Data:** 04/10/2026.


## Decisão 14 — Contrato único entre UI, AppRouter e fluxo seguro da EAP
- Componentes antigos não devem criar aliases silenciosos nem executar mutações implícitas.
- Nova obra nasce em `EAP_PROPOSTA`, com versão de planejamento `draft`; estrutura-base só é criada por ação explícita.
- Propostas EAP permanecem artefatos revisáveis e sua aplicação exige confirmação explícita.
- Mudanças no contrato MCP/AppRouter devem incluir teste de regressão e validação do CI antes do deploy.
- O fechamento desta rodada é considerado válido para avançar para a próxima etapa de teste, mas não altera a Aurora durante o teste integral.


## Decisão 15 — Escopo de versão obrigatório na EAP e no planejamento

- **Decisão:** nenhuma validação ou leitura operacional de EAP pode misturar versões históricas.
- **Motivo:** na homologação da AURORA TESTE, duas versões de 69 nós foram lidas juntas e produziram 138 nós, 106 folhas e 69 falsos erros de código duplicado.
- **Regra:** resolver primeiro a versão aplicável e filtrar todas as entidades versionadas por projectId + versionId. Nunca validar wbs_nodes de um projeto inteiro quando há histórico.
- **Regra adicional:** antes de corrigir dados diante de uma duplicidade inesperada, verificar se a duplicidade veio da consulta.
- **Gate:** EAP → Atividades somente com versão aprovada, zero bloqueios, regressão automatizada e coerência entre backend e UI.
- **Aprendizado:** cada incidente deve gerar documentação, teste de regressão e barreira no código.
- **Data:** 05/10/2026.

## Decisão 16 — PostgreSQL no Supabase (substitui a Decisão 2)

- **Decisão:** banco é PostgreSQL gerenciado no Supabase; MySQL/Aiven não fazem mais parte do sistema.
- **Quando:** outubro de 2026.
- **Motivo:** a Aiven cobrava por um MySQL que o próprio Render não conseguia alcançar de forma estável; o Supabase dá Postgres, auth e painel de SQL num lugar só, e o Postgres resolve modelagem de hierarquia (EAP) e séries temporais de medição sem gambiarra.
- **Consequências:** `drizzle-orm/pg-core` + driver `pg`; 36 tabelas de domínio e 13 migrações; `mysql2` e `mysql-core` saíram do projeto.
- **Barreira:** `scripts/audit-schema-pg.mjs` compara `_journal.json` com `__drizzle_migrations` **por timestamp** e derruba o boot se houver migração no repo que o banco não registrou. Foi a resposta ao incidente de 12/10, em que migrações novas nunca eram aplicadas em silêncio porque o app conecta como usuário somente-leitura.

## Decisão 17 — DockHosting com Nixpacks (substitui a Decisão 1)

- **Decisão:** build e runtime no DockHosting, a partir do repositório; nada de Vercel.
- **Quando:** outubro de 2026.
- **Motivo:** o sistema é um servidor Express que serve o SPA e fala com o banco — não é site estático nem função serverless. Na Vercel isso exigia contorno atrás de contorno; no DockHosting é uma imagem só.
- **Como:** o DockHosting constrói com **Nixpacks** (não com o `Dockerfile`), lendo `nixpacks.toml`: Node 22, `pnpm install --frozen-lockfile`, `pnpm run build`, start `npm start`.
- **Consequências:** `vercel.json` e `render.yaml` não existem mais; o `Dockerfile` fica como recurso de desenvolvimento local.
- **Barreira:** `server/build-plan.test.ts` trava as decisões do `nixpacks.toml` (nome canônico de pacote do nixpkgs, pnpm na versão do `packageManager`, sem `corepack`, `[start] cmd = npm start`) e `deploy-verify.yml` falha se o commit publicado não for o da `main`.
- **Erro que motivou a barreira:** um `nixPkgs = ["pnpm-10_x"]` inexistente derrubava o build no setup com um erro que não apontava para o arquivo.

## Decisão 18 — Render com Docker, um único serviço (substitui a Decisão 17)

- **Decisão:** produção é **um** serviço no Render, `plataforma-obras-3` (`srv-dbcd0gon74is7384ufag`), branch `main`, build pelo `./Dockerfile`, health check em `/readyz`, auto-deploy por commit. Um alvo, um URL, um lugar para olhar.
- **Quando:** outubro de 2026.
- **Motivo:** o projeto ficou com mais de uma "produção" ao mesmo tempo. Em 21/10 havia **quatro** serviços no Render apontando para o mesmo repositório e commit, e o DockHosting continuava no ar servindo um commit **dois commits atrás** (`62ca1ba`), contra o **mesmo banco Supabase**. Ou seja: dois endereços públicos, o mesmo banco, um com validação velha. Ninguém sabe qual dos dois um usuário está abrindo.
- **O que foi feito:**
  - três serviços Render redundantes apagados (`srv-db8cq2on74is73ekdmgg`, `srv-db8crk689jmc73d2cchg`, `srv-db8cta0m7kps73dujt2g`);
  - health check trocado de `/healthz` (não toca no banco) para `/readyz` (consulta o banco e responde 503 quando ele cai);
  - `autoDeployTrigger` fixado em `commit` (estava em `yes` sem gatilho, o que explicava o push que não disparava build);
  - `deploy-verify.yml` reescrito para o Render: pergunta se já existe deploy do SHA, dispara um se não existir, e vigia `/healthz` até o commit publicado bater;
  - `deploy-dockhosting.yml` apagado (era um **segundo** CI completo no mesmo commit, sem publicar nada);
  - `ci.yml` deixou de rodar em `develop` e `production-stable-20261005`: como o `sync-develop.yml` empurra cada commit de `main` para `develop`, todo merge gerava três execuções completas do mesmo CI.
- **Consequências:** docs e defaults de código que citavam DockHosting foram corrigidos (`docs/STACK-ATUAL.md`, `docs/DEPLOY.md`, `server/_core/env.ts`, `playwright.config.ts`, scripts de QA). `develop` continua existindo como espelho automático de `main`, mas não é branch de trabalho e não tem CI próprio. `nixpacks.toml` fica como plano B de build.
- **Barreira:** `deploy-verify.yml` falha quando o `/healthz` não serve o SHA do push. A regra prática é: **se o `commit` do `/healthz` não for o último de `main`, o deploy não aconteceu — não importa o que o painel diga.**
- **Pendência conhecida:** o DockHosting (`plataforma-obras.dockhosting.dev`) ainda pode estar no ar servindo `62ca1ba`. Desligar aquela instância é ação de painel (só o dono da conta consegue); enquanto estiver de pé, ela acessa o mesmo banco com código velho.
- **Resolvido em 21/10/2026:** o dono parou a instância. `/readyz` e `/` passaram a responder 503 e `/healthz` responde 200 com corpo vazio (antes devolvia `{"commit":"62ca1ba","commitSource":"SOURCE_COMMIT"}`). O endereço público de produção é só `https://plataforma-obras-3.onrender.com`.

## Decisão 19 — dependência de produção sem aviso conhecido (pnpm 10.34.5 + overrides)

- **Decisão:** `pnpm audit --prod` tem que sair **limpo**. Versão vulnerável de dependência transitiva é fixada em `pnpm-workspace.yaml` → `overrides`, e o pnpm é **10.34.5** em todos os lugares (`packageManager`, `Dockerfile`, `nixpacks.toml`, workflows).
- **Quando:** 21/10/2026.
- **Motivo:** `pnpm audit --prod` acusava **1 critical e 24 high**, quase todos alcançáveis por requisição HTTP: `path-to-regexp@0.1.12` (ReDoS no roteamento do Express), `fast-xml-parser@5.2.5` (poluição de protótipo no parse de XML, via `@aws-sdk/client-s3` — dependência que o código não usava), `xlsx@0.18.5`, `lodash`, `form-data`, `axios`, `nanoid` e `drizzle-orm` (SQL injection por identificador não escapado).
- **Por que subir o pnpm:** o pnpm **10.4.1 não aplica `overrides` vindos do `pnpm-workspace.yaml`**, e o campo `pnpm.overrides` do `package.json` foi descontinuado pelo próprio pnpm 10 (ele avisa que ignora a chave). Sem override, `express@4` continua preso em `path-to-regexp@0.1.12` e `recharts` em `lodash@4.17.21`. Com 10.34.5 os overrides passam a ser gravados no `pnpm-lock.yaml` — e aí o `--frozen-lockfile` do CI/Render falha se alguém tentar instalar com pnpm velho, que é exatamente a barreira que se quer.
- **Overrides fixados:** `path-to-regexp` 0.1.13, `lodash`/`lodash-es` 4.18.1, `form-data` 4.0.6, `mysql2` 3.24.6, `rollup` 4.59.0, `source-map-js` 1.2.2.
- **Dependências diretas atualizadas:** `axios` 1.20, `express` 4.22.3, `drizzle-orm` 0.45.4, `nanoid` 5.1.11, `vite` 7.3.7, `postcss` 8.5.31.
- **`xlsx` — caso especial:** a versão publicada no npm parou na **0.18.5**, com poluição de protótipo e ReDoS, e **não existe correção no npm** — o SheetJS passou a publicar em `cdn.sheetjs.com`. A dependência agora aponta para o tarball oficial `xlsx-0.20.3`. Ela **não podia virar devDependency**: `shared/price-sources/seinfra.ts` a importa em runtime para ler planilha **enviada pelo usuário** no importador SINAPI/SEINFRA — ou seja, era o vetor mais real de todos.
- **Limpeza:** `drizzle-kit`, `playwright` e `@types/pg` saíram de `dependencies` para `devDependencies` (nenhum é usado no boot — `scripts/migrate-pg.mjs` usa só `pg` + `drizzle-orm/migrator`); `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` foram **removidos** (nenhum módulo os importa — `server/storage.ts` sobe arquivo com `fetch` na URL pré-assinada devolvida pelo Forge, então eles eram só peso morto e traziam o `fast-xml-parser` junto); o pacote `add` (nunca importado, provável sobra de `pnpm add` sem argumento) e o `streamdown` (não importado em lugar nenhum, e origem dos avisos de mermaid/katex/dompurify/uuid/mdast) também saíram.
- **Consequências:** `pnpm audit --prod` = **0 vulnerabilidades**. O audit completo (com dev) ainda lista itens do **vitest 2** (`tinypool`, `vite@5.4.21`, `esbuild@0.21.5`), do loader antigo do `drizzle-kit` e do `postcss-selector-parser` do `@tailwindcss/typography` — nada disso entra na imagem de produção; a correção real é migrar para o vitest 4, que muda configuração e fica para um bloco próprio.
- **Barreira:** passo “Auditoria de dependências de produção” no `ci.yml` roda `pnpm audit --prod --audit-level=high` e emite `::warning::` — **não bloqueia**: um advisory publicado hoje não pode travar o deploy de uma correção amanhã, mas também não pode passar em silêncio.

## Decisão 20 — Lookahead de 4 semanas e PPC (Last Planner)

- **Decisão:** o planejamento de curto prazo passa a ter modelo próprio — `planning_constraints` (o que trava) e `weekly_commitments` (o que foi assumido e o que aconteceu) —, com PPC calculado sobre compromissos **avaliados** e só isso. Migração `0016_lookahead_ppc`.
- **Quando:** 21/10/2026.
- **Motivo:** até aqui o sistema sabia medir progresso (EVM) mas não sabia dizer *o que fazer segunda-feira* nem *quem prometeu o que*. O `% do Gantt` responde “quanto andou”, não “por que não andou”. Sem PPC e sem causa, toda reunião de obra vira discussão de percepção.
- **Por que duas tabelas e não uma:** restrição e compromisso têm ciclos de vida diferentes. Restrição nasce antes da semana e morre quando alguém resolve; compromisso nasce na semana e é avaliado no fim dela. Juntar as duas obrigaria a inventar um compromisso para registrar uma restrição — e aí o PPC contaria mentira.
- **Regras que ficaram no banco (não só no código):**
  - `week_start` tem de ser **segunda-feira** (CHECK com `at time zone 'UTC'`, porque `extract` sobre `timestamptz` usa o fuso da sessão e transformaria segunda 00:00 UTC em domingo 21:00 em São Paulo);
  - **não cumprir exige motivo** (CHECK `status <> 'nao_concluido' or reason is not null`);
  - **uma atividade por semana** (índice único `activity_id + week_start`), senão a mesma atividade valeria dois votos no PPC.
- **Regras que ficaram na conta:** PPC só sobre `concluido`+`nao_concluido` (nunca sobre `planejado`); semana sem avaliação devolve `null`, não 0%; `cancelado` sai da base; restrição `em_andamento` **ainda bloqueia** (só `removida`/`cancelada` liberam); tendência só quando a diferença passa de 5 pontos percentuais.
- **Datas:** `weekStart` trafega como `YYYY-MM-DD`, é gravado como meia-noite **UTC** e lido por comparação de instantes + `toISOString` — `localIso` deslocaria a semana em um dia em qualquer servidor a oeste de Greenwich. As datas das atividades vêm do offset em **dias úteis** sobre o calendário da obra, não de dias corridos.
- **Aplicação:** a `0016` foi aplicada pela Management API e **registrada** em `__drizzle_migrations` com o hash do arquivo — sem esse registro o boot tentaria criar tabelas existentes e derrubaria o start.
- **Verificação:** 22 testes novos (14 de conta pura em `lookahead.test.ts`, 8 de banco em `lookahead-dados.test.ts`, incluindo CHECK de segunda-feira, motivo obrigatório e unicidade). Suíte: **92 arquivos / 887 testes**.
- Detalhes de uso na obra: `docs/LOOKAHEAD-PPC.md`.
