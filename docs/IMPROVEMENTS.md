# Melhorias e Mudanças

Última atualização: 26/09/2026

---

## Sep/2026 — Migração Render → Vercel

### O problema
- Render free tier com cold start afetava Gantt e Linha de Balanço
- Frontend lento, timeout em campos gráficos

### O que foi feito
- Criado vercel.json com buildCommand: "pnpm build", outputDirectory: "dist/public", framework: "vite"
- Removido Rewrite que apontava pro Render
- Atualizada server/_core/env.ts (todas URLs → Vercel)
- Atualizado render.yaml (PUBLIC_APP_URL → Vercel)
- Atualizado github-oauth.test.ts (2 linhas → Vercel)
- Atualizado mcp-server/src/index.ts e dist/index.js (3 URLs → Vercel)
- Atualizado 7 MCP servers no SQLite (URLs onrender.com → Vercel)
- Removidos 27 bytes nulos de render.yaml

### Resultado
- Frontend online em: https://plataforma-obras-8uhqy3k5f-rafael-5864.vercel.app
- Build funcional: pnpm build ✅
- Deploy automático via GitHub connected ✅

---

## Sep/2026 — Instalação de Skills

### O problema
- Sistema sem skills de engenharia/vim para agentes
- Agentes sem padrões de desenvolvimento

### O que foi feito
- Instalado mattpocock/skills (10 skills de engenharia)
- Instalado superpowers (9 skills de processos)
- Instalado everything-claude-code (12 skills de desenvolvimento)
- Instalado ecc-guide via skills.sh

Total: +29 skills, 270 no total

---

## Sep/2026 — Adição de MCPs

### O problema
- Sistema sem integração com ferramentas externas (BIM, task tracking)
- Sem acesso a 1500+ apps

### O que foi feito
- Adicionado autodesk-bim MCP (BIM/Construction Cloud)
- Adicionado linear MCP (issue tracking)
- Adicionado clickup MCP (project management)
- Adicionado composio MCP (1500+ apps) — com token configurado

Total: 37 MCPs, 30 habilitados

---

## Sep/2026 — Actualização do gateway

### O problema
- Gateway com módulos desatualizados após update do Hermes

### O que foi feito
- Executado `hermes gateway restart`
- Novo PID: 31264

---

## Melhorias futuras (planejadas)

| Melhoria | Prioridade | Status |
|---|---|---|
| Configurar autodesk-bim com token | Alta | ⏳ | 
| Configurar linear com token | Média | ⏳ |
| Configurar clickup com token | Média | ⏳ |
| CI/CD automatizado com GitHub Actions | Alta | ⏳ |
| Testes e2e configurados | Média | ⏳ |
| Notion base de conhecimento via Composio | Média | ⏳ |
| Procore doc manager skill | Baixa | ⏳ |

## Out/2026 — Persistência do histórico conversacional do Arquimedes

### Incidente encontrado
- Ao fechar/reabrir o agente da obra, o histórico desaparecia porque AgentSidebar e AgentView mantinham as mensagens apenas em useState no navegador.
- O backend já persistia cada execução em agent_runs.contextJson, mas não existia uma rota para reidratar esse histórico.
- Isso fazia o Arquimedes voltar a consultar apenas o estado persistido da obra e, em uma obra sem EAP aplicada, concluir incorretamente que a proposta anterior não existia.

### Correção
- Criada agent.history, protegida por usuário e obra, para recuperar a última conversa persistida.
- Criada server/agent-history.ts para reconstruir mensagens a partir de agent_runs.contextJson + resultJson.
- AgentSidebar e AgentView passam a reidratar o chat ao abrir/reabrir a obra.
- Respostas que aguardam confirmação também são recuperadas.
- Limite de mensagem do agente ampliado de 6.000 para 12.000 caracteres para não truncar propostas EAP longas.
- Criado teste de regressão para recuperação de conversa, contexto inválido e estado aguardando confirmação.

### Regra preservada
A persistência da conversa **não aplica EAP, cronograma ou qualquer mutação na obra**. Proposta conversacional continua sendo proposta até aprovação explícita.
