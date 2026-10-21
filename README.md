# Plataforma Obras

A Plataforma Obras é uma aplicação web multiobras para planejamento e controle de obras. A base reúne portfólio, obras, atividades, Gantt, indicadores e um motor CPM determinístico preparado para EAP, dependências, caminho crítico, avanço físico, restrições e Linha de Balanço.

## Estado atual

- Painel multiobras com obras demonstrativas e seleção por projeto.
- Cadastro de nova obra persistido no banco quando o usuário está autenticado.
- Proprietário da obra registrado em `projects.ownerUserId`.
- EAP visual recolhível por fase, Gantt, tabela e Linha de Balanço demonstrativa.
- Motor CPM puro em `shared/cpm.ts`, com testes para FS, SS, lag e ciclos.
- Módulo **Agente IA** com contexto da obra, atividades, avanço e criticidade.
- Agente conectado a qualquer provedor compatível com a API Chat Completions: OpenRouter, gateway OpenCode ou uma API própria.
- Chave da IA mantida exclusivamente no backend; nunca é enviada ao navegador.
- Endpoint de saúde `GET /healthz` (devolve o commit publicado) e `GET /readyz` (banco + schema).
- CI em GitHub Actions e deploy no **Render** (`plataforma-obras-3`) a cada push em `main`. O workflow `Deploy verify (Render)` confere no `/healthz` se o commit publicado é o que foi mergeado e **falha** quando não é.

Os dados demonstrativos continuam sendo fallback para ambientes sem banco. Eles não representam medições oficiais nem devem ser usados para decisões contratuais.

## Configuração do agente de IA

O backend usa um adaptador OpenAI-compatible. Configure no Render (`plataforma-obras-3`), em **Environment**, as variáveis abaixo:

| Variável | Exemplo | Finalidade |
| --- | --- | --- |
| `AI_API_BASE_URL` | `https://openrouter.ai/api/v1` | URL base do provedor, sem `/chat/completions` |
| `AI_API_KEY` | `sk-or-...` | Chave secreta do provedor; não commitar |
| `AI_MODEL` | `openai/gpt-oss-20b:free` | Modelo disponível no provedor escolhido |
| `PUBLIC_APP_URL` | `https://plataforma-obras-3.onrender.com` | Referer opcional enviado ao OpenRouter |

Também são aceitos endpoints próprios, por exemplo `https://ia.exemplo.com/v1`, desde que respondam ao formato `POST /chat/completions` com `choices[0].message.content`. A aplicação apresenta uma mensagem operacional quando o agente ainda não foi configurado, em vez de quebrar o restante do sistema.

## MCPs

O repositório atual não contém servidores MCP embutidos nem os nomes dos três MCPs externos. Por isso, a primeira entrega deixa o agente e o domínio preparados para ferramentas, mas não inventa endpoints ou permissões. A integração correta deve ser feita depois que cada MCP for identificado com:

1. nome do servidor;
2. transporte (`stdio`, HTTP streamable ou SSE);
3. URL ou comando;
4. autenticação necessária;
5. ferramentas disponibilizadas.

A recomendação para a evolução é conectar os MCPs em três áreas separadas: planejamento/cronograma, produção/medições e documentos/relatórios. As ferramentas devem ser chamadas pelo backend, com allowlist por operação e registro de auditoria; nunca diretamente pelo navegador.

## Banco e migrações

PostgreSQL no Supabase (schema `drizzle/schema.ts`, `drizzle-orm/pg-core`, driver
`pg`). São **36 tabelas de domínio** e **13 migrações** em
`drizzle/meta/_journal.json`; o `/readyz` mostra 37 porque conta também a
`"__drizzle_migrations"`.

Em produção nada é manual: o `start` do `package.json` roda `migrate-pg.mjs`
antes de subir o servidor, e o `audit-schema-pg.mjs` depois. Se faltar migração
no banco, o audit falha e o deploy não promove — em vez de servir uma aplicação
com schema velho.

Localmente:

```bash
DATABASE_URL="postgresql://..." pnpm db:migrate   # aplica o que falta
DATABASE_URL="postgresql://..." pnpm db:audit     # confere schema x código
pnpm db:generate                                  # gera migração nova
```

Detalhes de `USE_SUPABASE=1`, usuário somente-leitura e aplicação de migração
como owner: `docs/DEPLOY.md`.

As consultas de atividades, EAP e dependências preservam o fallback demonstrativo para visitantes, mas validam a permissão da obra quando existe sessão autenticada e banco conectado. O CI usa uma única versão explícita do pnpm (`10.4.1`) para evitar divergência entre o workflow e o `packageManager`.

## Executar localmente

```bash
pnpm install
pnpm dev
```

Verificação completa:

```bash
pnpm check
pnpm test --run
pnpm build
```

## Arquitetura

```text
client/       interface React/Vite e módulo Agente IA
server/       API Express + tRPC + autenticação
server/agent.ts agente contextual por obra e provedor OpenAI-compatible
shared/       regras determinísticas reutilizáveis
server/db.ts  acesso Drizzle ao banco
drizzle/      schema e migrações PostgreSQL (pg-core)
```

## Próximas etapas

A próxima evolução deve adicionar dependências persistidas, calendários, baselines versionadas, medições por período, restrições com responsável e prazo, equipes/frentes, custos e auditoria de alterações. Depois que os três MCPs forem identificados, cada integração deve receber um adaptador com permissões explícitas e testes de contrato.

## Integração MCP e continuidade

A camada inicial de integração está em `server/integrations/`, com cliente MCP para sessões Streamable HTTP/SSE, adaptadores dos três servidores e política de ferramentas. O backend expõe `integrations.mcpStatus` e `integrations.mcpReadOnlyCall` como operações protegidas; nenhuma escrita externa é executada automaticamente.

O plano versionado, com fases, checkpoints, regras de segurança e ordem de retomada, está em [PLANO-EVOLUCAO.md](./PLANO-EVOLUCAO.md).

## Documentação para agentes

A base de conhecimento do sistema está em `/docs/`:

| Arquivo | Descrição |
|---|---|
| `docs/README.md` | Visão geral do sistema, arquitetura, MCPs, skills |
| `docs/STACK-ATUAL.md` | **Comece aqui**: onde o sistema roda hoje (GitHub + Render + Supabase) |
| `docs/DEPLOY.md` | Deploy, variáveis de ambiente, migrações em produção, runbook de incidente |
| `docs/DECISIONS.md` | Decisões de arquitetura e o porquê (inclui o que saiu: DockHosting, Railway, Vercel, Aiven, MySQL) |
| `docs/SETUP.md` | Como configurar e rodar (banco, frontend, backend, MCPs, tokens) |
| `docs/IMPROVEMENTS.md` | Melhorias e mudanças feitas (Sep/2026) |
| `docs/AGENTS.md` | Guia para agentes — como usar o sistema |

Qualquer agente que entre no projeto deve ler `docs/AGENTS.md` primeiro.
