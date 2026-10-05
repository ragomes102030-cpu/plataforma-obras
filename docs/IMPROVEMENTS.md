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

## Out/2026 — Reidratação do histórico ao reabrir a janela do Arquimedes

### Novo incidente identificado
- A persistência em `agent_runs` e a reconstrução por múltiplos runs já estavam implementadas, mas a janela `JanelaAgente` consultava o histórico apenas na montagem do componente.
- Ao fechar e reabrir visualmente a janela dentro da mesma sessão, o componente podia permanecer montado; nesse caso nenhuma nova consulta era disparada e o usuário continuava vendo uma conversa vazia.
- O comportamento observado no teste confirmou que o Arquimedes continuava recebendo o contexto da obra (`OB-SYAE5F`), mas não o texto conversacional anterior.

### Correção
- Ao receber o evento de abertura do Arquimedes, `JanelaAgente` agora executa `agent.history.refetch()`.
- Ao finalizar uma execução, a janela também força a atualização do histórico persistido antes de liberar a próxima pergunta.
- A API `agent.history` continua reconstruindo até 100 execuções da obra/usuário em ordem cronológica, sem aplicar qualquer mutação estrutural.

### Validação
- Commit: `60c487c060a20f841f29105d4a5ce9cc48ce59e4`.
- Deploy Render: `dep-db0pajjtqb8s738m7dl0`.
- Estado: `live`.
- Teste de regressão existente cobre reconstrução de múltiplos runs; a validação E2E adicional é fechar/reabrir o Arquimedes e confirmar que uma mensagem anterior reaparece.



## Out/2026 — Garantia de contexto conversacional no backend

### Incidente encontrado
- A reidratação da UI e a reconstrução de múltiplos `agent_runs` estavam corretas, porém o próximo `agent.chat` ainda dependia do array de mensagens mantido pelo navegador.
- O teste pós-deploy confirmou a falha: após reabrir o Arquimedes, o modelo recebia a pergunta atual sem o contexto conversacional anterior.
- Conclusão: persistência do run e recuperação do histórico não garantiam, por si só, que o contexto recuperado chegasse ao orquestrador.

### Correção
- O backend agora recupera as conversas persistidas da mesma obra/usuário antes de iniciar um novo run.
- O histórico persistido é mesclado com as mensagens recebidas da UI, usando sobreposição para não duplicar mensagens que a UI já tenha enviado.
- O contexto final enviado ao orquestrador permanece limitado a 20 mensagens, preservando o contrato do endpoint.
- A UI continua reidratando `agent.history`; o backend passa a ser a barreira de segurança contra perda de contexto.

### Regressão
- Adicionados testes para: nova pergunta com UI sem histórico e UI já contendo o histórico persistido.
- Build Render da correção concluído com sucesso.
- Nenhuma EAP, cronograma ou outra estrutura de obra foi alterada.


## Out/2026 — Fechamento do contrato frontend/backend e regressão integral
- O CI do `develop` chegou a verde após alinhar componentes legados aos routers atuais.
- EAP passou a ter fluxo explícito de proposta → revisão → confirmação → aplicação; a criação de nova obra não semeia EAP genérica automaticamente.
- O router EAP foi exposto separadamente para dicionário, validação, revisão e aplicação controlada.
- CPM voltou a transportar calendário da obra e restrições declaradas.
- Gap analysis passou a respeitar somente ferramentas efetivamente publicadas no catálogo MCP.
- Gateway LLM ganhou recuperação de resposta truncada e o ReAct encerra com mensagem `system`.
- Regressão final: 483 testes passaram; typecheck e build passaram.
- Render iniciou o deploy correspondente; logs confirmaram schema íntegro e 0 migrações pendentes.
- Incidente registrado para rastreabilidade: contratos legados do frontend estavam fora de sincronia com o AppRouter atual.


## Out/2026 — Homologação Aurora: falso bloqueio por mistura de versões da EAP

### Incidente
A tela da AURORA TESTE exibiu 138 nós, 106 folhas e 69 bloqueios de código EAP duplicado. A EAP corrente possuía 69 nós e 53 folhas.

### Causa raiz
A rota de validação carregava wbs_nodes somente por projectId e, portanto, misturava duas versões históricas idênticas antes de executar validateEap().

### Correção
- validação passou a ser limitada ao versionId da versão de planejamento aplicável;
- versão histórica concorrente da Aurora deixou de ser aprovada;
- geração de atividades foi protegida por versão aprovada;
- leituras de planejamento passaram a usar escopo de versão;
- atividades inválidas sem duração fundamentada foram removidas da versão de teste;
- foi criada a regressão scripts/regression-aurora-eap.mjs;
- foi criada a documentação normativa docs/EAP-INTEGRIDADE-E-APRENDIZADO.md.

### Regra aprendida
Duplicidade inesperada deve ser investigada primeiro como possível erro de escopo da consulta. Histórico não pode entrar automaticamente em validações operacionais.

### Critério de avanço
A próxima etapa só inicia quando a mesma versão aprovada apresentar zero bloqueios, backend e UI estiverem coerentes e a regressão automatizada estiver aprovada.
