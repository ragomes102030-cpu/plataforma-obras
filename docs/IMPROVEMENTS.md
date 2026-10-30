# Melhorias e Mudanças

> **Documento normativo.** Última atualização: 30/10/2026.

## 30/out/2026 — Separar conversas do Arquimedes por sessão

**Sintoma:** a janela do Arquimedes continuava exibindo respostas longas de etapas antigas e levava instruções anteriores para novas perguntas, como uma revisão de escopo depois de trabalhar na EAP.

**Causa:** o histórico era reconstruído por obra e usuário, sem identificador de conversa. O limite de 20 mensagens reduzia o tamanho, mas não isolava etapas nem evitava que mensagens recentes de outra etapa ocupassem o contexto.

**Correção:** cada conversa recebe um identificador salvo no navegador e no contexto dos runs. A consulta e a reconstrução do contexto filtram por esse identificador. O histórico legado continua acessível como “Histórico anterior”; novas conversas começam sem misturar as mensagens antigas. A janela mostra as seis mensagens mais recentes por padrão e permite expandir as anteriores.

**Regressão:** testes do histórico verificam o isolamento de sessões novas e a preservação do legado; testes da janela verificam a retomada por sessão e o recolhimento das mensagens antigas. Testes focados e `pnpm check` passaram. A validação visual e o deploy ainda dependem da publicação desta alteração.

## 29/out/2026 — Não confundir restrição de baseline com proibição de editar a EAP

**Sintoma:** a operação autorizada para corrigir a EAP da PROJETO ESCOLA ARQUIMEDES recebeu uma resposta dizendo que a ferramenta de escrita não existia, embora o backend a registre. A aplicação não ocorreu.

**Causa:** a classificação de intenção tratava qualquer ocorrência de “não crie” como proibição global de mutação. A frase “não aprove e não crie baseline” retirava do modelo a ferramenta local de edição, embora a ordem principal pedisse aplicar correções no rascunho.

**Correção:** separar proibições globais de somente leitura de restrições específicas a aprovação/baseline, e remover comandos negativos antes de detectar verbos de operação. Assim, uma edição explicitamente solicitada continua operacional sem liberar aprovação ou baseline; instruções “READ_ONLY” e “não aplique nada/não altere dados” seguem bloqueando escrita.

**Regressão:** testes do intent-router cobrem pedido de editar a EAP com baseline proibida, diagnóstico sem alteração e proibição global de escrita.

## 29/out/2026 — Recuperar chamadas de ferramenta inválidas e persistir diagnóstico do Arquimedes

**Sintoma:** ao tentar aplicar a proposta local à EAP da PROJETO ESCOLA ARQUIMEDES, a execução encerrou com “Argumentos inválidos para a ferramenta aplicar_proposta_eap_local”, sem resposta final visível no histórico.

**Causa:** o runtime lançava exceção ao receber argumentos que não eram JSON válido. Isso encerrava o ciclo ReAct antes de o modelo poder corrigir a chamada ou explicar a falha. Além disso, a reconstrução do histórico ignorava `errorMessage` de execuções terminais sem resultado.

**Correção:** o runtime responde à chamada malformada com um erro estruturado ligado ao `tool_call_id`, não executa a ferramenta e deixa o modelo continuar. O histórico recuperado inclui o diagnóstico terminal se não houver resultado final, evitando duplicação quando já há resposta persistida.

**Regressão:** testes cobrem recuperação sem execução da ferramenta, persistência da falha no histórico e não duplicação de resposta. A EAP permanece sem aprovação e a correção não cria baseline.

## 29/out/2026 — Reconstruir conversa do Arquimedes sem duplicar snapshots

**Sintoma:** o chat da PROJETO ESCOLA ARQUIMEDES repetia blocos inteiros de pedidos e respostas antigos. Instruções de análise e somente leitura reapareciam junto com a ordem mais recente, tornando imprevisível a escolha da ação do agente.

**Causa:** cada execução persiste em `contextJson.messages` um snapshot completo da conversa. `mergeAgentConversations` tratava cada snapshot como novas mensagens e concatenava mensagem a mensagem. A conversa crescia com cópias dos históricos anteriores.

**Correção:** reconstruir a conversa sobrepondo o sufixo já lido ao prefixo do snapshot seguinte, preservando a janela recente de até 20 mensagens. A execução continua usando apenas a última ordem do usuário para classificar intenção.

**Regressão:** `server/agent-history.test.ts` reproduz duas execuções sucessivas, verifica que o histórico anterior aparece uma única vez e confirma a inclusão da resposta mais recente. Teste focalizado e `pnpm check` passaram. Ainda é necessário publicar a correção e conferir no ambiente ao vivo que o chat fica conciso e que a próxima operação usa a ordem atual.

## 29/out/2026 — Revalidar EAP após aplicar proposta inicial

**Sintoma:** na Escola Arquimedes, a árvore mostrava 8 nós após aplicar a proposta como rascunho, mas o cartão de validação continuava em 0 nós e bloqueava com “A EAP não pode estar vazia”.

**Causa:** o estado vazio da tela invalidava somente a consulta `projects.wbs`; a validação e a proposta do Arquimedes ficavam com dados em cache.

**Correção:** após aplicação, invalidar em paralelo a árvore, a validação estrutural e a leitura da proposta. A aplicação continua sendo apenas rascunho e não aprova a EAP nem cria baseline.

**Regressão:** `client/src/components/escopo-eap-studio.test.ts` verifica as três invalidações. Teste focado (13), `pnpm check` e `pnpm build` passaram; warnings conhecidos: Node local 24 (projeto requer 22), variáveis de analytics ausentes e bundle acima de 500 kB. A validação visual pós-deploy ainda está pendente.

## 28/out/2026 — Dashboard: separar QA e evitar avanço provisório

**Auditoria:** a AURORA TESTE mostrava 71 atividades na Dashboard, embora a LOB separasse 53 atividades reais e 18 de demonstração. Durante a carga do orçamento, o avanço também mudava de `+14,6 p.p.` por quantidade para `−14,1 p.p.` ponderado por valor, sem marcar o primeiro número como provisório.

**Correção:** a Dashboard e sua Curva S recebem o mesmo conjunto de códigos QA da grade/LOB e excluem essas atividades dos indicadores executivos. O carregador de lookahead exclui atividades QA, sua produção, restrições e compromissos do cálculo operacional/PPC. A grade soma apenas produção confirmada, não demonstrativa e ocorrida até o fim do dia em `America/Sao_Paulo`, inclusive quando o marcador QA está na atividade. O avanço e a investigação detalhada ficam sem percentuais até haver orçamento consultado e valor positivo ligado às atividades. Nenhum dado da obra é alterado.

**Validação:** a suíte completa passou com 146 arquivos, 1.287 testes aprovados e 8 ignorados. `pnpm check`, `pnpm build` e `git diff --check` passaram; os testes focados de produção, Dashboard e planejamento também passaram. Permanecem avisos de analytics ausente e chunk >500 kB; o ambiente local usa Node 24 enquanto o projeto declara 22.x. A última leitura válida de `/healthz` foi `ccce709` com `/readyz` saudável; a tentativa de revalidar expirou, então o estado ao vivo está **NÃO TESTÁVEL** nesta rodada. As correções seguem sem deploy e a interface corrigida ainda não foi validada visualmente. Evidência e plano: `docs/AUDITORIA-EXECUTIVA-2026-10-28.md` e `docs/superpowers/plans/2026-10-28-auditoria-dashboard.md`.

## 28/out/2026 — Aplicação segura de proposta EAP

**Auditoria:** a rota `aplicarPropostaEap` confiava no resultado de validação enviado pelo navegador e gravava nós em sequência sem transação. Uma proposta inválida podia deixar alterações parciais, e a API aceitava bases de decomposição livres na criação manual.

**Correção:** a entrada é validada por schema, a proposta é novamente validada/normalizada contra a versão de trabalho no servidor e as alterações são aplicadas em uma transação. A atualização preserva os campos propostos e o vocabulário de decomposição é limitado aos valores normativos. Nenhuma aprovação ou baseline é criada.

**Validação:** 5 regressões PGlite passaram para proposta inválida sem mutação, aplicação válida com campos persistidos/código recalculado, base inválida, vínculo de orçamento fora da obra e conciliação sem aplicação parcial. A suíte completa de 146 arquivos passou. Evidência: `docs/AUDITORIA-EXECUTIVA-2026-10-28.md`.

**Nota de interface:** falha ao carregar a EAP agora aparece com mensagem e retry; não é apresentada como obra sem estrutura.

## 28/out/2026 — Isolamento de QA no CPM operacional

**Sintoma:** na AURORA TESTE, a rota de CPM excluía as atividades marcadas como exemplo, mas ainda carregava dependências ligadas a elas. O motor recebia pontas de dependência fora da rede operacional e recusava o recálculo com `Dependência aponta para atividade inexistente`.

**Correção:** CPM e gate de baseline usam a mesma seleção operacional. Vínculos ligados a atividades de QA ficam explicitamente fora do cálculo e a interface mostra quantas atividades e dependências de exemplo foram excluídas. Dependências com endpoints realmente ausentes continuam no conjunto para que o validador as reporte; apenas vínculos que apontam para atividades de exemplo são removidos. Atividades de QA e seu histórico permanecem no banco.

**Regressão:** `shared/operational-planning.test.ts` cobre a exclusão dos vínculos de QA, preservação dos vínculos reais e a validação de referências realmente ausentes.

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


## Incidente 2026-10-05 — sequences do PostgreSQL ficaram atrás do MAX(id)

**Sintoma:** ao aprovar o padrão do dicionário da EAP na AURORA TESTE, a interface exibiu erro no INSERT de `agent_decisions`.

**Causa raiz:** a transferência dos dados para o Supabase preservou os IDs das linhas, mas as sequences das colunas `identity` permaneceram próximas do valor inicial. Em `agent_decisions`, por exemplo, havia `MAX(id)=2` enquanto a sequence estava em `1`; o próximo INSERT tentava reutilizar um ID existente e colidia com a chave primária.

**Correção imediata:** todas as sequences de identidade do schema público foram comparadas com `MAX(id)` e corrigidas. A sequence nunca é rebaixada quando já está à frente, preservando IDs reservados por transações concorrentes ou testes revertidos.

**Correção permanente:** o boot em Supabase passou a executar uma sincronização idempotente das sequences antes da API subir. Isso cobre futuras transferências/importações sem depender de correção manual.

**Teste de regressão executado:** INSERT transacional em `agent_decisions` com projeto 7, usuário 1, estágio `EAP_DICIONARIO` e decisão `approved` retornou novo ID sem erro; a transação foi revertida. Após o teste, `agent_decisions` permaneceu com `MAX(id)=2` e a sequence avançada para 3.

**Regra permanente:** toda migração/transferência de dados PostgreSQL que preserve IDs deve verificar as sequences de colunas identity. "Tabela com dados" e "sequence pronta para novo INSERT" são condições distintas e ambas precisam ser validadas.

**Não liberar:** nenhuma funcionalidade de escrita deve ser considerada homologada apenas porque leitura, build ou validação estrutural passaram. Toda mutação crítica precisa de teste real contra o banco de homologação.


## 28/out/2026 — Período cadastrado da obra e Linha de Balanço

**Sintoma:** a distribuição física de trechos dentro da janela oficial do CPM era rejeitada quando o término do CPM ultrapassava `projects.plannedFinish`. Na AURORA TESTE, a janela visível do cronograma seguia até dezembro de 2028, enquanto o período cadastrado da obra terminava antes; a tela de edição do escopo não permitia corrigir esse cadastro.

**Correção:** a edição do escopo passou a apresentar início e término previstos da obra. O backend aceita alterar qualquer uma das datas, valida o intervalo combinado com a data atual não alterada e mantém a guarda de acesso ao projeto. A distribuição LOB continua limitada pela janela oficial do CPM e pelo período cadastrado da obra; as datas do cronograma não são alteradas.

**Regressão:** `server/access-isolation.test.ts` confirma que o dono consegue atualizar o período, período invertido é rejeitado e outro usuário não altera as datas. A conclusão de produção ainda exige repetir a distribuição de trechos no fluxo LOB autenticado.
## 28/out/2026 — Auditoria executiva iniciada pela Dashboard

Na revisão da Dashboard, grade, EAP e CPM, foram corrigidos filtros de QA nos indicadores e no lookahead, a base inconsistente do avanço enquanto o orçamento carregava, a inclusão de produção não confirmada/futura no realizado, estados de erro que pareciam carregamento ou ausência de EAP, validação/transação da proposta EAP e integridade de vínculos entre obra/versão. A auditoria CPM também passou a carregar feriados de todos os anos envolvidos nos offsets e restrições, e a persistir a rota local em transação.

Evidência e escopo detalhados em `docs/AUDITORIA-EXECUTIVA-2026-10-28.md`. Validação anterior das primeiras correções: 146 arquivos / 1.287 testes aprovados, 8 ignorados; `pnpm check`, `pnpm build` e `git diff --check` aprovados antes da última mudança CPM. Sem commit, deploy ou mutações no sistema ao vivo. A inspeção visual responsiva e as áreas remanescentes do backlog ainda não foram concluídas.

## 29/out/2026 — Escopo inicial sem falsa aprovação

**Sintoma:** a tela classificava qualquer formulário não vazio como “Escopo formal declarado”, usava linguagem de contrato para uma obra didática e apresentava frentes, locais e quantitativos do cronograma como “critérios para aprovação do escopo”, embora esses dados sejam construídos nas etapas posteriores do planejamento.

**Correção:** os rótulos agora descrevem dados de referência, premissas e pendências; a conferência pré-EAP verifica apenas natureza/localização e disponibilidade da descrição. Frentes, locais e quantidades permanecem na rastreabilidade posterior, sem serem pré-requisito para declarar o escopo inicial. A proposta residencial também deixou de presumir contenções, estrutura de concreto, alvenaria e áreas externas não informadas; registra esses pontos como decisão pendente e usa base de decomposição por entregáveis.

**Validação:** regressões `client/src/components/escopo-eap-studio.test.ts` e `server/eap-proposal-scope-regression.test.ts` cobrem a separação dos conceitos e a ausência de sistemas não declarados. 13 testes direcionados, `pnpm check` e `git diff --check` passaram. A correção está no código local; não houve commit, deploy ou alteração dos dados ao vivo.

## 29/out/2026 — Dashboard distingue plano vazio de grade vazia

**Sintoma:** a tela inferia “Ainda não há atividades planejadas” a partir da grade do cronograma. Se o plano já tivesse atividades, mas elas não estivessem representadas na grade, ou se a consulta do plano falhasse, a mensagem poderia diagnosticar a causa errada. A orientação também fazia parecer que toda atividade precisa simultaneamente de duração e quantidade.

**Correção:** os estados da Dashboard agora distinguem consulta pendente ou com erro, plano sem atividades, plano com atividades sem linhas na grade e painel pronto. O estado sem grade orienta conferir vínculos, datas/durações e CPM. A orientação para atividade aceita duração fundamentada ou, quando aplicável, quantidade e produtividade.

**Validação:** 10 testes direcionados, `pnpm check` e `pnpm build` passaram. O build alertou que as variáveis de analytics não estavam definidas no ambiente local e que o bundle principal supera 500 kB; não impediram o build. A alteração está somente no código local; a Dashboard live ainda deve ser revalidada depois do deploy. Nenhuma obra ou dado ao vivo foi alterado.

## 29/out/2026 — Escopo não presume que o cronograma preceda quantitativos

**Sintoma:** a tela dizia que sem atividade não havia quantidade e mostrava `EAP → Quantitativos → Orçamento → Atividades` como sequência rígida. Quantitativos podem ser levantados por pacote da EAP antes de detalhar atividades; orçamento e cronograma são refinados de forma integrada. A tabela também chamava frentes, locais e quantidades derivados do cronograma de dimensões do escopo e podia exibir “COMPLETA” com apenas um registro em cada dimensão.

**Correção:** o fluxo agora mostra objeto/escopo/EAP, planejamento integrado (quantitativos e orçamento + atividades e dependências), revisão/baseline, execução/controle e entrega/encerramento. A explicação reconhece quantitativos por pacote EAP antes do cronograma. A tabela identifica frentes, locais e quantidades como dados do escopo e do planejamento e não afirma completude.

**Lacuna remanescente:** a descrição do empreendimento continua armazenada em um único campo livre; inclusões, exclusões, premissas, restrições, critérios de aceite e pendências não têm campos individualizados e rastreáveis no cadastro de escopo.

**Validação:** 20 testes direcionados, `pnpm check`, `pnpm build` e `git diff --check` passaram. O ambiente local usa Node 24 enquanto o projeto declara 22.x; o build ainda avisa sobre variáveis de analytics ausentes e bundle principal acima de 500 kB. Código local somente; sem commit, deploy ou mutação ao vivo.

## 29/out/2026 — EAP versionada e ligação fundamentada com atividades

**Achados:** a geração genérica da EAP podia chamar um semeador legado que criava atividades, dependências e orçamento sem revisão/aprovação, ignorava a tipologia selecionada e consultava estruturas fora da versão de trabalho. A semente manual também preenchia inclusões e exclusões contratuais sem evidência. O botão de uma folha da EAP tentava criar atividade sem duração, embora o servidor rejeite duração zero/não informada; a interface não explicava a exigência nem refletia o gate de aprovação.

**Correções:** a estrutura-base passa a ser criada somente na versão editável e somente como EAP; usa a tipologia informada/cadastrada, não preenche inclusões/exclusões/aceite fictícios e marca textos do template como sugestão a revisar. A criação de atividade só é exposta após aprovação da versão vigente e agora solicita duração em dias úteis, ou quantidade junto com produtividade; a validação do servidor continua sendo a autoridade final. O fluxo visual também separa aprovação da EAP da baseline do cronograma, que vem após CPM.

**Validação:** 39 testes direcionados passaram (`eap-visibilidade`, `eap-seeder`, formulário de estimativa e regressões de Escopo); `pnpm check`, `pnpm build` e `git diff --check` passaram. Avisos locais: Node 24 no lugar de 22.x, variáveis de analytics ausentes e bundle principal acima de 500 kB. As mudanças estão no código local; sem commit, deploy ou alteração de dados ao vivo.

## 29/out/2026 — Atividades recalculam prazo quando muda o quantitativo

**Achado:** na aba Atividades, editar produtividade com quantidade recalculava duração e invalidava o CPM; editar quantidade deixava a duração e o resultado do CPM antigos, apesar de a atividade continuar exibindo produtividade.

**Correção:** quando uma atividade possui produtividade positiva e quantidade positiva, alterar a quantidade recalcula a duração por `ceil(quantidade / produtividade)`, aplica a mesma regra de faixa otimista/pessimista e invalida os dados CPM se o prazo calculado mudar. A tela informa esse comportamento no campo. Edição de quantidade sem produtividade não modifica a duração manual.

**Limitação identificada:** o modelo ainda não registra explicitamente se a duração é entrada manual ou derivada. Com quantidade e produtividade preenchidas, o sistema passa a tratá-la como derivada; a origem do prazo não pode ser preservada como distinção independente no schema atual.

**Validação:** 50 testes direcionados passaram, incluindo regressão da mutação, EAP/escopo e cálculo de duração; `pnpm check`, `pnpm build` e `git diff --check` passaram. Permanecem os avisos locais de Node 24 (projeto declara 22.x), analytics sem configuração e bundle acima de 500 kB. Código local somente; sem commit, deploy ou alteração de dados ao vivo.

## 29/out/2026 — Dependências podem ser montadas incrementalmente

**Achado:** a tela adiciona um vínculo por vez, mas o endpoint validava conectividade de toda a rede em cada inserção. Se existissem três ou mais atividades, a primeira ligação era rejeitada porque as demais ainda estavam isoladas; não havia caminho de construção gradual, embora o CPM exija uma rede final conectada.

**Correção:** a validação oferece um modo de construção que transforma somente a desconexão temporária em aviso. A mutation salva o vínculo e devolve esse aviso à tela; ciclos, auto dependência, referências inválidas e demais erros continuam bloqueados. O modo padrão da validação permanece estrito, portanto CPM e baseline continuam bloqueados até a rede ficar conectada.

**Lacuna remanescente:** a interface permite adicionar vínculos, mas ainda não oferece remover/editar um vínculo incorreto; isso exige correção em uma próxima evolução da aba.

**Validação:** 22 testes focados passaram (`dependency-validator`, âncoras paralelas, CPM e contrato do endpoint); `pnpm check`, `pnpm build` e `git diff --check` passaram. O build manteve os avisos de Node 24 versus 22.x, analytics sem configuração e bundle principal acima de 500 kB. Código local somente; sem commit, deploy ou alteração de dados ao vivo.

## 29/out/2026 — CPM não exibe resultado vencido como vigente

**Achados:** a aba CPM dizia que a rede estava OK quando havia qualquer dependência, embora só o servidor conhecesse o resultado da validação de conectividade. O texto também afirmava que o CPM podia calcular múltiplas atividades sem vínculos, mas o validador bloqueia uma rede desconectada. Além disso, a tela continuava exibindo folgas/caminho crítico persistidos quando o cálculo estava desatualizado. O painel Monte Carlo chamava o P80 de prazo defensável para prometer e equiparava o determinístico a um P50 aproximado, afirmações mais fortes que as premissas genéricas da simulação sustentam.

**Correção:** a interface chama os vínculos de “Revisar” até haver CPM atual, oculta resultados persistidos vencidos, corrige a explicação sobre rede sem vínculos e descreve o P80 como saída condicionada às premissas simuladas. A duração determinística não é mais rotulada como P50 aproximado.

**Validação:** 75 testes direcionados passaram (Escopo, EAP, Atividades, Dependências e CPM); `pnpm check`, `pnpm build` e `git diff --check` passaram. Avisos de build: runtime Node 24 quando o projeto declara 22.x, analytics sem configuração e bundle principal acima de 500 kB. Código local somente; sem commit, deploy ou alteração de dados ao vivo.

## 29/out/2026 — Gate de baseline ignora vínculos ligados a dados de QA

**Achado:** a captura já removia atividades de exemplo do snapshot e do gate de CPM, mas validava conectividade usando todas as atividades/dependências da versão. Uma atividade de QA separada podia bloquear a baseline da rede operacional, contrariando a mensagem da tela.

**Correção:** a validação de rede na captura usa agora a mesma seleção operacional aplicada ao CPM; dependências com referências realmente ausentes continuam visíveis ao validador.

**Validação:** 15 testes passaram entre isolamento de QA, governança da baseline, versões aprovadas e seleção operacional. `pnpm check`, `pnpm build` e `git diff --check` passaram. Sem commit, deploy ou mudança na obra ao vivo.

## 29/out/2026 — Gantt separa tarefas de exemplo do plano operacional

**Achado:** CPM e Linha de Balanço já isolavam tarefas marcadas como exemplo, mas o Gantt clássico ainda desenhava essas tarefas, incluía suas datas no período e mantinha suas dependências na exportação. A tela misturava escopos diferentes sem avisar.

**Correção:** a grade e a régua temporal do Gantt agora usam as atividades operacionais; vínculos e indicadores críticos usam o mesmo recorte. A interface informa quantas tarefas de exemplo foram omitidas. As tarefas continuam acessíveis na aba Atividades e no modo de QA da Linha de Balanço.

**Validação:** 39 testes focados desta rodada, `pnpm check`, `pnpm build` e `git diff --check` passaram. Build ainda aponta Node local 24 versus requisito 22.x, analytics sem variáveis e chunk principal acima de 500 kB. Código local somente; sem commit, deploy ou mudança de dados ao vivo.

## 29/out/2026 — Produção distingue rascunhos e medições confirmadas

**Achados:** a aba somava rascunhos nos totais e no avanço médio, apesar de o CPM/Curva S usarem apenas medições confirmadas. Também exibia instrução para confirmar produção acima do quantitativo, mas mantinha o botão de registro desabilitado nesse mesmo caso.

**Correção:** grade e médias de produção usam somente lançamentos confirmados; o histórico continua exibindo rascunhos separadamente. Excesso real agora exige confirmação explícita, que é reiniciada ao trocar atividade ou quantidade. A unidade informada fica fixa quando a atividade tem unidade planejada; o servidor rejeita unidade divergente.

**Validação:** o teste da seleção de confirmadas e a regressão de unidade divergente passaram junto com as demais regressões focadas; `pnpm check`, `pnpm build` e `git diff --check` passaram. Build ainda aponta Node local 24 versus requisito 22.x, analytics sem variáveis e chunk principal acima de 500 kB. Código local somente; sem commit, deploy ou mudança de dados ao vivo.

## 29/out/2026 — Aba de riscos não apresenta exemplos como dados da obra

**Achado:** a tela mostrava seis riscos estáticos como registros reais e oferecia um formulário cujo envio apenas fechava a tela, sem persistir.

**Correção:** removidos riscos e métricas fictícios e o formulário sem efeito. A aba informa claramente que ainda não há cadastro persistente de riscos.

**Validação:** teste de transparência da aba, `pnpm check`, `pnpm build` e `git diff --check` passaram. Build ainda aponta Node local 24 versus requisito 22.x, analytics sem variáveis e chunk principal acima de 500 kB. Código local somente; sem commit, deploy ou mudança de dados ao vivo.

## 29/out/2026 — Sidebar separa planejamento, custos, execução e governança

**Achado:** a sidebar agrupava Documentos, Orçamento e Custos, Riscos e Curva S sob “Execução e Controle”. Orçamento mistura planejamento de custos com custos reais/medições; Riscos e Documentos são funções transversais. Além disso, a aba Riscos estava marcada como pronta apesar de ainda não gravar nem consultar registros.

**Correção:** os grupos agora distinguem Planejamento, Cronograma, Custos e Finanças, Execução e Controle, Governança e Sistema. Curva S permanece em controle; Riscos e Documentos estão em Governança. Riscos exibe estado pendente até haver persistência.

**Base:** os módulos de Risk Register e Cost/Cash Flow do Primavera Cloud são áreas próprias e relacionam risco com impactos em custo/prazo; o Project Operations documenta orçamento, custos reais/comprometidos e controle como partes relacionadas, mas distintas. Isso apoia a separação por domínio sem forçar orçamento e custo real em uma única fase.

**Validação:** teste de integridade dos grupos (sem duplicação ou destinos órfãos) e estado pendente de Riscos; `pnpm check`, `pnpm build` e `git diff --check`.

## 30/out/2026 — Arquimedes preserva resultados quando o chat não finaliza

**Achado:** respostas finais vazias ou só com reasoning faziam o runtime lançar erro e descartar o resultado das ferramentas. Isso podia ocultar uma aplicação local da EAP já gravada. A instrução final também podia pedir nova confirmação após o engenheiro já ter autorizado uma operação reversível.

**Correção:** o runtime solicita uma síntese adicional sem ferramentas. Se o modelo continuar sem texto, apresenta uma resposta de contingência baseada no retorno verificado da aplicação EAP; erros e persistência não confirmada são reportados sem declarar sucesso nem repetir a mutação. A instrução de encerramento respeita a ordem operacional e continua proibindo aprovação e baseline automáticas.

**Documentação:** política de decomposição e registro de integridade do Arquimedes atualizados com a regra de síntese vazia, sem repetição de mutação e com conferência da persistência.

**Validação:** `pnpm check` passou; Node local 24.21.0 gerou o aviso de engine porque o projeto exige Node 22.x. Nenhum teste foi adicionado ou executado nesta alteração. Código local na branch `feat/eap-hierarchy-guidance`; sem commit novo, merge, deploy ou mutação no banco ao vivo.

## 30/out/2026 — Arquimedes atualiza o escopo declarado pela fonte local

**Achado:** o agente conseguia consultar o escopo local, mas não tinha uma ferramenta de escrita para corrigir um escopo autorizado; o MCP de escopo não estava disponível. A tela humana possuía a mutação, mas isso não a tornava acessível ao agente.

**Correção:** adicionada `atualizar_escopo_obra_local`, exposta somente em intenção operacional e restrita a descrição, localização e natureza. A gravação verifica propriedade da obra, registra antes/depois na auditoria e relê os campos na mesma transação. Datas, orçamento, EAP, baseline e aprovações não fazem parte da ferramenta. Manual do agente atualizado para exigir releitura e auditoria do escopo antes de decompor a EAP.

**Validação:** `server/orchestrator.test.ts` passou (21 testes), `pnpm check`, `pnpm build` e `git diff --check` passaram. Build local avisou que Node 24 está fora do requisito 22.x, que variáveis de analytics não estão configuradas e que o bundle principal excede 500 kB. Deploy e alteração de dados ao vivo ainda pendentes.

## 30/out/2026 — Arquimedes continua respostas interrompidas e trabalha local primeiro

**Achado:** uma resposta de auditoria do chat terminou exatamente no meio de uma frase. O runtime aceitava texto mesmo quando o provedor sinalizava limite de saída e encerrava a execução como respondida. A skill operacional ainda descrevia os MCPs como caminho principal, contrariando os motores e validadores locais já disponíveis.

**Correção:** o runtime reconhece `finish_reason=length`, pede até duas continuações sem ferramentas e marca claramente a resposta como parcial se o limite persistir. Auditorias e decisões de planejamento agora pedem uma síntese curta com etapa, fonte/versão, achados com impacto, proposta, lacunas e próxima decisão. A skill define a Plataforma Obras como fonte e motor primários; MCPs complementam o trabalho e não bloqueiam capacidades locais.

**Critérios operacionais:** análise somente leitura; proposta com evidência e impacto; ordem explícita do engenheiro antes de aplicar rascunho; releitura e validação após a gravação; auditoria com resultado. Aprovação da EAP e baseline continuam gates independentes.

**Validação:** seis testes do runtime ReAct passaram, incluindo continuação sem ferramentas e aviso após duas tentativas; `pnpm check` e `git diff --check` passaram. Aviso de ambiente: projeto exige Node 22.x, sessão usa Node 24.21.0. Código local na branch `fix/arquimedes-continuation`; sem deploy ou alteração de dados ao vivo.

## 30/out/2026 — reduzir falsos alertas lexicais na EAP

### Problema e causa
- A EAP da PROJETO ESCOLA ARQUIMEDES apresentou 33 apontamentos heurísticos; após corrigir fronteiras reais de escopo, a tela ainda mostrava 28.
- O validador local tratava qualquer substring compartilhada como sobreposição e comparava pendências do pai como exclusões definitivas.
- O Arquimedes não recuperou os 33 itens com os trechos necessários para classificação individual; esse limite foi registrado sem inferir resultado por item.

### Correção e evidência
- A comparação lexical passou a ignorar vocabulário genérico e exigir uma cláusula idêntica ou pelo menos dois termos significativos em comum.
- Uma cláusula do pai que identifica pendência ou declara que não é exclusão deixa de gerar bloqueio contra o filho que cobre esse trabalho.
- Quando a raiz declara “Nenhuma exclusão definitiva”, a lista explicativa completa é tratada como pendências, preservando esse contexto apesar das vírgulas.
- Exclusões definitivas com correspondência significativa continuam gerando aviso para revisão.
- Testes de regressão: 40 testes em três arquivos passaram (`eap-validator`, `eap-approval-validator`, `eap-resolution-engine`); `git diff --check` sem erros.

### Estado
- Mudança local na branch limpa `fix/eap-overlap-noise`, baseada no commit publicado `2aff9ea`; sem commit, merge ou deploy.
- A EAP online permanece v2 em elaboração; não foi aprovada nem recebeu baseline.
- A tela online ainda mostrava 28 apontamentos após as edições de escopo; verificar novamente após integrar e publicar o código.
