# Decisões de Arquitetura

Última atualização: 26/09/2026

---

## Decisão 1: Vercel vs Render

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

## Decisão 2: Aiven para banco de dados

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
  - Token configurado: ak_SQrThA3oqjqvMWAhVcoh
  - Base de conhecimento e automação externa
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
