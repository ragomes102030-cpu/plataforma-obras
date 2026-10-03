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


## Out/2026 — Fechamento do contrato MCP EAP do Arquimedes
### Falha encontrada
- O MCP EAP publicado expõe 23 ferramentas, mas o catálogo/política do Arquimedes reconhecia apenas parte delas.
- Ferramentas de escopo e dicionário (incluindo `definir_criterio`, `criar_item_escopo`, vínculos e validação dos 100%) ficavam invisíveis ou sem autorização de execução.
- `deletar_projeto` estava marcado como destrutivo, mas não pertencia ao conjunto de mutações reconhecidas pelo orquestrador.
- Isso podia produzir bloqueios de fluxo mesmo com a EAP estruturalmente válida.

### Correção
- Alinhado o catálogo do Arquimedes aos 23 tools reais do `mcp-eap-server`.
- Incluídas as ferramentas de escopo, dicionário e projetos nas políticas correspondentes.
- Mantida a regra proposta → confirmação explícita → mutação → reconsulta/validação.
- Criado teste de regressão para exposição controlada do contrato completo da EAP.

### Evidência
- Auditoria automatizada: 23/23 tools do servidor EAP possuem domínio no Arquimedes.
- Nenhuma mutação EAP necessária ficou fora de `MUTATING_TOOLS`.
- O build do serviço principal passou durante o deploy.
- A validação funcional na obra `TESTE INTEGRAL ARQUIMEDES 001` ainda é a etapa seguinte; Aurora permanece intocada.
