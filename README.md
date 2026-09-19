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
- Endpoint de saúde `GET /healthz` para o Render.
- CI em GitHub Actions e deploy automático configurado no blueprint do Render.

Os dados demonstrativos continuam sendo fallback para ambientes sem banco. Eles não representam medições oficiais nem devem ser usados para decisões contratuais.

## Configuração do agente de IA

O backend usa um adaptador OpenAI-compatible. Configure no Render, em **Environment**, as variáveis abaixo:

| Variável | Exemplo | Finalidade |
| --- | --- | --- |
| `AI_API_BASE_URL` | `https://openrouter.ai/api/v1` | URL base do provedor, sem `/chat/completions` |
| `AI_API_KEY` | `sk-or-...` | Chave secreta do provedor; não commitar |
| `AI_MODEL` | `openai/gpt-oss-20b:free` | Modelo disponível no provedor escolhido |
| `PUBLIC_APP_URL` | `https://plataforma-obras-api.onrender.com` | Referer opcional enviado ao OpenRouter |

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

A migration `drizzle/0002_bitter_paladin.sql` adiciona `ownerUserId` em `projects`. Em uma base existente, aplique as migrações com:

```bash
DATABASE_URL="mysql://..." pnpm db:push
```

O Render precisa ter `DATABASE_URL` apontando para um MySQL compatível. Sem banco, o sistema continua em modo demonstrativo e não persiste novas obras.

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
drizzle/      schema e migrações MySQL
```

## Próximas etapas

A próxima evolução deve adicionar dependências persistidas, calendários, baselines versionadas, medições por período, restrições com responsável e prazo, equipes/frentes, custos e auditoria de alterações. Depois que os três MCPs forem identificados, cada integração deve receber um adaptador com permissões explícitas e testes de contrato.
