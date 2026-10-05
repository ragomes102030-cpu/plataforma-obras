# Guia para Agentes

Última atualização: 04/10/2026

---

## Como usar este sistema

### Primeiro: leia a base de conhecimento
Qualquer agente que entre no projeto deve ler:
1. `docs/README.md` — visão geral do sistema
2. `docs/DECISIONS.md` — por que as coisas foram feitas assim
3. `docs/SETUP.md` — como configurar e rodar
4. `docs/IMPROVEMENTS.md` — o que foi feito e o que falta

### Está no diretório
```
plataforma-obras/
├── docs/
│   ├── README.md         # Visão geral
│   ├── DECISIONS.md      # Decisões de arquitetura
│   ├── SETUP.md          # Como configurar
│   └── IMPROVEMENTS.md   # Melhorias e mudanças
├── client/              # Frontend Vite + React
├── server/              # Backend Express + tRPC
├── mcp-server/          # MCP servers
├── docs/                # Documentação (este diretório)
└── package.json         # Root package (monorepo)
```

---

## Ferramentas disponíveis

### MCPs habilitados (30)
O sistema tem 30 MCPs habilitados. Para ver a lista completa, ver `docs/README.md` → seção "MCPs configurados".

Principais MCPs para obras:
- `aiven` — banco MySQL
- `plataforma-obra` — próprio sistema
- `cronograma` / `mcp-cronograma-server` — cronograma
- `eap` / `mcp-eap-server` — estrutura analítica
- `gantt` / `mcp-gantt-lob-server` — gantt + linha de balanço
- `composio` — 1500+ integrações (token configurado)
- `excel` — manipulação de planilhas
- `whatsapp` — envio de mensagens

MCPs sem token (precisam ser configurados):
- `autodesk-bim` — BIM/Construction Cloud
- `linear` — issue tracking
- `clickup` — project management

### Skills disponíveis (270)
Para ver lista completa, ver `docs/README.md` → seção "Skills instalados no AionUi".

Principais skills para obras:
- `sinapi-SEINFRA` — custos SINAPI/SEINFRA
- `gantt-chart` — gantt charts
- `budget-variance-analyzer` — análise de variações orçamentárias
- `cash-flow-forecaster` — fluxo de caixa
- `project-kpi-dashboard` — KPI dashboards
- `oce-scheduling-4d5d` — 4D/5D scheduling
- `weather-construction` — previsão de chuva
- `eap` — EAP, cronograma, quantitativos
- `plataforma-obras` — plataforma própria
- `vercel-cli-with-tokens` — deploy Vercel (oficial)
- `production-audit` — auditoria de produção
- `production-scheduling` — scheduling de produção

---

## Como executar tarefas

### Criar uma tarefa de planejamento
1. Use o MCP `mcp-cronograma-server` ou `MCP Cronograma`
2. Ou use o sistema diretamente via `plataforma-obra` MCP

### Consultar custos SINAPI
1. Use skill `sinapi-SEINFRA`
2. Use skill `construction-data-collection` para scraping

### Gerar relatório
1. Use skill `daily-progress-report` para relatórios diários
2. Use skill `budget-variance-analyzer` para análise orçamentária

### Gerar gráfico Gantt
1. Use skill `gantt-chart` 
2. Ou use MCP `mcp-gantt-lob-server`

### Enviar comunicado
1. Use MCP `whatsapp` para enviar mensagem
2. Ou use MCP `composio` para Slack/Gmail

---

## Boas práticas

### Documentar mudanças
Sempre que fizer uma mudança significativa:
1. Atualize `docs/IMPROVEMENTS.md` com data, problema, solução, resultado
2. Atualize `docs/DECISIONS.md` se foi uma decisão de arquitetura
3. Se precisar de nova configuração, atualize `docs/SETUP.md`

### Formatos de data
Use formato ISO: `YYYY-MM-DD`

### Commits
Commits devem ser descritivos. Exemplo:
```
feat: adiciona integracao com composio
fix: corrige url do mcp-eap-server (render → vercel)
docs: atualiza base de conhecimento com melhorias sep/2026
```

---

## Problemas comuns

| Problema | Solução |
|---|---|
| MCP não conecta | Verifique token e URL em docs/SETUP.md |
| Build falha | pnpm install && pnpm build |
| Banco não conecta | Verifique DATABASE_URL em .env.local |
| Vercel não deploya | Verifique GH_TOKEN e vercel.json |
| Skill não encontrado | Verifique se SKILL.md existe em skills/<nome>/ |
| Gateway desatualizado | Execute `hermes gateway restart` |

---



## Regra obrigatória de integridade da EAP

Antes de trabalhar na EAP, qualquer agente deve ler também:
- docs/EAP-INTEGRIDADE-E-APRENDIZADO.md
- docs/EAP-POLITICA-DECOMPOSICAO.md

Essa documentação é normativa. Ela registra os incidentes da homologação Aurora e transforma cada incidente em regra + teste de regressão + barreira de produto.

### Regra crítica: nunca misturar versões
Quando wbs_nodes possui versionId, nenhuma validação operacional deve carregar todos os nós apenas por projectId. Primeiro deve ser resolvida a versão aplicável e depois os nós devem ser filtrados por projectId + versionId.

Isso vale para validação, árvore EAP, snapshots, atividades, dependências, relatórios e fontes de evidência do agente.

Se números de nós/folhas ou duplicidades forem exatamente o dobro de uma versão conhecida, suspeitar primeiro de mistura de histórico. Não alterar dados antes de verificar o escopo da consulta.

### Gate EAP → Atividades
Atividades só podem ser liberadas depois de:
1. versão aprovada identificada;
2. validação estrutural da mesma versão;
3. zero bloqueios estruturais;
4. códigos únicos dentro da versão;
5. backend e UI coerentes;
6. regressão Aurora aprovada.

EAP aprovada não autoriza duração artificial. Atividade precisa de duração fundamentada ou quantidade + produtividade válida.

### Aprendizado obrigatório
Todo incidente deve resultar em registro documental, teste de regressão e proteção no código. Não considerar uma falha resolvida apenas porque a interface ficou verde.

## Contatos

- **Gerente:** Rafael Gomes (grafaelalexandre@gmail.com)
- **GitHub:** ragomes102030-cpu
- **Sistema:** https://plataforma-obras-8uhqy3k5f-rafael-5864.vercel.app


### Política de decomposição adaptativa da EAP

A profundidade da EAP não é fixa. Não implementar nem assumir uma sequência obrigatória como fase → disciplina → serviço.

O Arquimedes deve:
- decompor por entregáveis/escopo e usar a base mais adequada ao ramo;
- manter um critério coerente entre irmãos;
- parar quando chegar a um pacote de trabalho controlável;
- permitir profundidades diferentes em ramos diferentes;
- tratar mistura de bases como alerta de revisão, não como erro automático;
- nunca criar níveis artificiais apenas para padronizar a árvore.

A referência normativa completa está em docs/EAP-POLITICA-DECOMPOSICAO.md.
