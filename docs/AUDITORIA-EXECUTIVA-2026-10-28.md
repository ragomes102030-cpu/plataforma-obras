# Auditoria executiva — 28/10/2026

## Escopo desta etapa

Auditoria iniciada pela Dashboard da AURORA TESTE (`OB-PUPOCN`, obra 7), com leitura ao vivo e inspeção do código; em seguida iniciou-se revisão das proteções da EAP. Nenhuma mutação foi feita no sistema ao vivo. Este documento registra as primeiras etapas, não uma certificação integral do produto.

## Evidência ao vivo

- Aplicação consultada: `https://plataforma-obras-3.onrender.com/obra/7`.
- Obra e código visíveis na interface: AURORA TESTE / `OB-PUPOCN`.
- `/healthz` consultado nesta rodada: commit publicado `ccce709`, branch `main`. A página autenticada da Aurora abriu no navegador; a revisão da LOB ao vivo e a leitura atual das distribuições no Supabase ainda não foram concluídas.
- Na observação anterior da Linha de Balanço: 53 atividades do plano real e 18 atividades de demonstração explicitamente ocultas. A contagem atual de localizações e parcelas ainda precisa ser reconfirmada.
- Dashboard, antes do filtro: 71 atividades, logo incluía as mesmas 18 demonstrações (`53 + 18 = 71`).
- Na primeira renderização, a Dashboard mostrou 18,9% realizado contra 4,2% planejado (`+14,6 p.p.`). Depois que o orçamento carregou, mudou para 15,1% contra 29,2% (`−14,1 p.p.`). A tela não distinguia os dois critérios enquanto carregava.
- Após o carregamento, valor agregado, compromissos, curva S, lançamentos e consultas complementares apareceram. Portanto, a espera inicial observada foi transitória; não foi confirmada falha persistente de rede.

## Problemas confirmados

### P2 — O filtro de período da LOB incluía atividades fora do gráfico

- **Evidência:** o gráfico escondia barras que não cruzavam o eixo, mas elas ainda reservavam faixas, apareciam na legenda, contagem e análise de fluxo. O painel podia mostrar centenas de janelas e uma faixa alta quando poucas atividades estavam no período.
- **Causa raiz:** recorte temporal era aplicado só durante a renderização das barras, depois de calcular altura, contagem e indicadores.
- **Módulos afetados:** `AuroraLinhaBalanco.tsx`, lane packing, legenda, contagens e análise de fluxo.
- **Correção implementada:** altura, barras, legenda, totais e análise agora usam apenas atividades que cruzam o eixo visível. Atividades fora da janela não reservam linhas pendentes. A branch remota `fix/lob-alturas-locais-compactas-20261028` foi examinada: está em `e4ce608` e ainda reserva uma faixa por série; não foi reaplicada. O `ccce709` já tinha packing por concorrência local; a correção local cobre também o recorte temporal.
- **Aceitação:** atividades fora do eixo não alteram altura, contagens, legenda ou diagnóstico; barras simultâneas ocupam faixas distintas; serviços sequenciais reutilizam faixas.

### P1 — Atividades de demonstração contaminam os indicadores executivos

- **Evidência:** LOB indica 53 atividades reais e 18 de QA ocultas; Dashboard contava 71.
- **Causa raiz:** `Home.tsx` já obtém `exemploPorCodigo` e envia essa exclusão à LOB, mas não à `PainelDoCronograma`. A Dashboard calculava total/status/datas com o agregado completo e enviava atividades completas à Curva S. Em paralelo, `coletarDadosLookahead` não selecionava `scheduleActivities.exemplo` e agregava compromissos/restrições sem limitar aos IDs operacionais.
- **Módulos afetados:** Dashboard executiva, cartões de status, investigação de atividades, Curva S, semana, PPC e restrições de lookahead. Os registros no banco permanecem válidos para QA.
- **Correção implementada:** propagar o mesmo conjunto de códigos de exemplo à Dashboard; filtrar linhas e atividades antes de calcular os indicadores e a Curva S; ocultar lançamentos desses códigos na lista executiva recente; filtrar atividades QA, produção, restrições e compromissos no carregador de lookahead. Os registros de origem não são alterados.
- **Aceitação:** a mesma Aurora deve apresentar 53 atividades operacionais; nenhuma atividade QA afeta contagens, datas, status, curvas, PPC, restrições ou compromissos; a LOB continua oferecendo a simulação QA separadamente.

### P1 — Indicador de avanço troca de critério durante o carregamento

- **Evidência:** o primeiro estado exibiu `+14,6 p.p.` calculado pelo fallback da grade; ao carregar orçamento, o painel recalculou pelo valor orçado e mostrou `−14,1 p.p.`.
- **Causa raiz:** sem custos carregados, `PainelDoCronograma` usava o agregado ponderado por quantidade. Quando o orçamento chegava, usava pesos financeiros, sem estado visual que qualificasse a primeira régua como indisponível.
- **Módulos afetados:** resumo do desempenho, gauge e comparação planejado × realizado.
- **Correção implementada:** o estado do avanço agora depende da consulta de orçamento e de um denominador de valor aplicável. Em carregamento, erro ou ausência de valor ligado às atividades, a Dashboard mostra estado explicativo e não publica percentuais provisórios.
- **Aceitação:** percentuais só aparecem com orçamento consultado e pesos positivos associados às atividades; falha/ausência não pode parecer zero nem inverter o diagnóstico sem indicação.

### P1 — Produção não executada inflava o realizado da grade

- **Evidência:** a rota compartilhada `planning.grade` somava todos os registros de produção associados ao projeto, sem filtrar estado, marcador de demonstração ou data de referência. O total era aplicado às linhas do cronograma e, por consequência, a Dashboard, Gantt, LOB, EAP e curva.
- **Causa raiz:** a consulta executiva lia `production_entries` por projeto e agregava `quantity` diretamente. A tabela diferencia `rascunho` de `confirmada` e possui `exemplo`; a data futura também precisa ficar fora do realizado “até hoje”.
- **Correção implementada:** a grade agora consulta somente lançamentos confirmados, não demonstrativos (incluindo atividade marcada como QA), e ocorridos até o fim do dia de referência em `America/Sao_Paulo`. A aba de produção mantém o acesso ao histórico original. A curva executiva aplica filtros equivalentes aos lançamentos recebidos diretamente.
- **Aceitação:** rascunhos, demonstrações, datas futuras e registros de outra obra não alteram o realizado nem o total da grade; registros não são apagados nem reescritos.

### P2 — Erro na consulta da grade parecia carregamento infinito

- **Evidência:** `PainelDoCronograma` usava `carregandoGrade || !agregado` para decidir se mostrava o esqueleto. Se a consulta terminasse com erro sem dados, `!agregado` continuava verdadeiro e a interface nunca explicava a falha nem oferecia nova tentativa.
- **Correção implementada:** o painel recebe o estado de erro da consulta central e mostra uma mensagem acessível com ação de tentar novamente; o skeleton fica reservado para o carregamento real.
- **Aceitação:** consulta pendente mostra carregamento; consulta falha sem cache mostra erro recuperável; resposta vazia continua sendo tratada como vazio.

### P2 — Erro ao consultar a EAP parecia ausência de estrutura

- **Evidência:** `AbaEap` verificava `wbs.isPending`, mas tratava todo `wbs.data` ausente como lista vazia. Em falha de rede, a tela oferecia o caminho de criar uma EAP como se a obra não tivesse nenhuma.
- **Correção implementada:** a aba mostra erro acessível e retry antes de avaliar o estado vazio.
- **Aceitação:** falha de leitura não apresenta proposta de EAP vazia/criação; resposta vazia real continua oferecendo o fluxo normal.

### P1 — Aplicação de proposta EAP confiava na validação do navegador

- **Evidência:** `aplicarPropostaEap` aceitava `proposal: z.any()`, não revalidava a árvore contra a versão gravável e escrevia em loop fora de transação. Códigos já ocupados eram ignorados; pai ausente ou erro do banco depois de uma inserção podia deixar alterações parciais. Campos de quantidade, unidade e escopo da proposta também eram descartados.
- **Causa raiz:** a rota tratava `proposal.validation` do cliente como proteção, embora chamadas tRPC possam enviar qualquer payload. Cada insert/update era confirmado independentemente.
- **Correção implementada:** schema de entrada limitado; validação estrutural e normalização de códigos no servidor contra a versão de trabalho; rejeição de propostas inválidas; inserções/atualizações e obsolescência da proposta em uma transação. Os campos estruturados da proposta passam a ser persistidos. A criação manual aceita apenas as bases de decomposição definidas pela política.
- **Aceitação:** proposta adulterada/desatualizada não grava; árvore válida é aplicada inteira na versão de trabalho, sem baseline; falha em qualquer item reverte todas as mudanças.

### P1 — Itens e atividades podiam ser vinculados a versões/obras erradas

- **Evidência:** `budgets.createItem` e `createItems` confirmavam a versão do orçamento, mas não validavam o `wbsNodeId` recebido. `aplicarConciliacao` validava a obra do orçamento, mas carregava atividades de todas as versões; em lote, validava e gravava dentro do mesmo loop.
- **Causa raiz:** falta de validação composta por obra e versão para a chave WBS; validação de lote feita junto com cada escrita.
- **Correção implementada:** os novos vínculos de orçamento exigem nó da EAP da versão de trabalho atual e rejeitam nós de outra obra ou de versões antigas. A conciliação limita atividades à versão de trabalho, valida todos os pares e rejeita IDs repetidos antes de qualquer escrita; alterações e evento de auditoria entram na mesma transação.
- **Aceitação:** nenhum item orçado pode apontar para EAP de outra obra/versão; um lote inválido não deixa vínculos parciais; o evento de auditoria só existe se todas as alterações forem confirmadas.

### P1 — CPM, Gantt e LOB mapeavam datas com feriados de apenas um ano

- **Evidência:** `planning.calculateCpm`, `calculateCpmLocal` e `planning.grade` carregavam o calendário pelo ano inicial da obra; o endpoint de distribuição LOB também validava todas as datas com apenas esse ano.
- **Impacto:** datas posteriores podiam ignorar feriados dos anos seguintes, deslocando inícios e términos exibidos pelo cronograma, Gantt e LOB e a verificação da janela de uma parcela multilocal.
- **Correção implementada:** CPM e grade agora combinam calendários plurianuais; a grade usa horizonte conservador de até sete dias civis por dia útil e considera também o término cadastrado. A validação de distribuição usa o calendário até o término da obra. A persistência local continua sendo transacional.
- **Aceitação:** offsets, restrições, datas derivadas do CPM e validações de parcelas atravessando anos usam feriados dos anos correspondentes; falha durante persistência mantém o resultado anterior inteiro.

## Validação da correção

- Testes focados da integração do painel, carregamento, consulta PostgreSQL e EAP — aprovados.
- `pnpm test` — 147 arquivos passaram; 1.292 testes passaram e 8 foram ignorados (execução concluída após as mudanças atuais).
- `pnpm check`, `pnpm build` e `git diff --check` — aprovados no estado final atual.
- Build: avisos conhecidos de variáveis de analytics ausentes e chunk JavaScript >500 kB; Node local v24.21.0 enquanto o projeto declara Node 22.x.
- `/healthz` reconsultado: produção continua em `ccce709` (deploy `srv-dbcd0gon74is7384ufag-hibernate-cb4b9dd55-mpxmb`). O navegador autenticado confirmou que o Dashboard publicado ainda exibe 71 atividades, enquanto o código local filtra as 18 atividades QA; as correções locais não estão implantadas.
- Testes Chromium locais da LOB — 2 E2E aprovados: edição de vínculo por local e vista mobile com período filtrado. As capturas desktop e mobile mostram faixa de altura compacta, barras fora do período ausentes e legenda, contagem e análise limitadas ao que cruza o eixo. O E2E é sintético e não valida as distribuições atuais da Aurora.
- Teste visual direto da LOB publicada: **NÃO TESTÁVEL** nesta rodada; a sessão autenticada não aceitou a navegação automatizada. As correções locais ainda não estão publicadas.
- Testes focados após a correção temporal: 27 aprovados (LOB, renderização da LOB e CPM). `pnpm check`, `pnpm build` e `git diff --check` aprovados; o build mantém avisos de variáveis de analytics ausentes e chunk JavaScript >500 kB. `pnpm test` — 147 arquivos passaram; 1.292 testes passaram e 8 foram ignorados. E2E Chromium local: 2 passaram.
- A consulta direta ao Supabase MCP está indisponível nesta sessão. A contagem atual de atividades com local confirmado, parcelas multilocais e saldos é **NÃO TESTÁVEL**.
- Nenhum deploy desta correção foi feito. A versão publicada verificada é `ccce709`.

## Pendências da auditoria integral

Concluir EAP e versões com validação visual; orçamento/quantitativos/produtividade; consistência entre dependências, CPM, Gantt, baseline e LOB; execução e medições; segurança e isolamento; cobertura visual responsiva; tratamento geral de erros e observabilidade. Cada área será registrada com severidade, evidência, causa, módulos e aceitação antes da respectiva correção.
