# Diagnóstico e estabilização da Plataforma Obras

## Conclusão executiva

A falha principal não estava em um único componente. O sistema combinava quatro problemas que se amplificavam: o Render gratuito iniciava os MCPs lentamente; o cliente tratava catálogo vazio como se fosse indisponibilidade normal; o agente exigia o mesmo `project_id` para EAP, cronograma e Gantt/LOB; e a aplicação mantinha caminhos legados que consultavam o LLM sem passar pelo orquestrador. Também havia risco de isolamento de dados porque algumas consultas por obra eram públicas ou aceitavam obras com proprietário nulo.

A correção aplicada mantém o agente em modo somente leitura, mas torna a coordenação determinística. Cada domínio MCP recebe o vínculo correto da obra. O chat legado foi direcionado ao mesmo orquestrador. A criação de uma obra agora grava o plano inicial em uma transação única. Dados demonstrativos deixaram de ser um fallback implícito.

## Evidências observadas

O endpoint de saúde da API respondeu com `200` após o deploy. Os logs anteriores mostraram respostas `502` durante o cold start dos serviços MCP, seguidas de inicialização MCP bem-sucedida. Isso explica parte dos relatos de “MCP não conecta”: o serviço estava iniciando, mas a primeira janela de retry era curta e o catálogo podia virar uma lista vazia.

A suíte de validação anterior estava verde antes das mudanças. O build produzia a aplicação, embora com o aviso de chunks grandes no frontend. Esse aviso não bloqueava execução e não foi tratado como causa do problema de coordenação do agente.

## Causas corrigidas

### Cold start e respostas vazias do MCP

O retry de consultas somente leitura passou a usar duas novas tentativas em runtime, com backoff de dois e cinco segundos. O circuito permanece como proteção contra falhas persistentes. Respostas vazias para requisições JSON-RPC com `id` agora são tratadas como erro, em vez de serem convertidas em catálogo vazio.

### Vínculo MCP incorreto

O orquestrador passou a aceitar `mcpProjectIds` por domínio. O vínculo EAP é usado no MCP EAP, o vínculo de cronograma é usado no MCP de cronograma e o vínculo Gantt/LOB é usado no MCP correspondente. O formato antigo de `mcpProjectId` foi mantido como compatibilidade temporária.

### Dois agentes com comportamentos diferentes

O procedure `agent.chat`, usado pela tela legada, agora usa o mesmo `runProjectOrchestrator` da sidebar. Com isso, as duas interfaces compartilham catálogo de ferramentas, política somente leitura, auditoria, retry MCP e identificação de fontes.

### Criação parcial de obras

A criação da obra passou a inserir o registro, a EAP inicial, o cronograma, as dependências e o catálogo de produção dentro de uma transação. O frontend deixou de disparar uma segunda requisição de inicialização que podia falhar depois de a obra já ter sido criada.

### Dados demonstrativos e isolamento

A listagem de obras, atividades, EAP e dependências passou a exigir autenticação. A condição de acesso considera somente o proprietário da obra. Os dados demonstrativos só podem ser habilitados deliberadamente com `ALLOW_DEMO_DATA=true`; por padrão, a aplicação não apresenta dados fictícios quando o banco está indisponível.

A procedure de chamada MCP manual também passou a exigir `projectId`, verificar o proprietário e buscar o vínculo externo do domínio no banco. Para ferramentas com escopo de obra, o `project_id` informado pelo cliente é substituído pelo vínculo autorizado.

### Ordem metodológica da obra

Os MCPs da Plataforma Obras foram construídos seguindo a filosofia de **Aldo Dórea Mattos**. O agente agora recebe essa ordem como regra operacional: partir do descritivo para estruturar a EAP; derivar as atividades; validar a sequência e as precedências; montar a rede PERT/CPM; calcular caminho crítico e folgas; consolidar cronograma, Gantt e linha de base; alocar recursos; e usar produção, curva S e Linha de Balanço para análise e controle.

Essa ordem não trata Gantt, Linha de Balanço e produção como módulos independentes. A EAP é a estrutura-mãe. O Gantt representa o cronograma. A Linha de Balanço é aplicada quando há repetição espacial ou produtiva. A produção devolve o realizado para o controle do plano. Quando uma etapa anterior não estiver disponível, o agente deve declarar a lacuna em vez de inventar dados.

### Identificação das fontes

As respostas do orquestrador agora terminam com uma indicação das fontes: dados locais da obra e, quando aplicável, os domínios MCP efetivamente consultados. Isso evita apresentar inferência ou dado local como se viesse de uma fonte externa.

## DeepSeek

A DeepSeek foi configurada no serviço `plataforma-obras-api` como provider primário OpenAI-compatible, usando o modelo `deepseek-chat`. A chave foi enviada somente como variável secreta do Render e não foi adicionada ao código, ao arquivo Markdown ou ao Git.

As variáveis configuradas foram `LLM_PRIMARY_PROVIDER`, `LLM_PRIMARY_BASE_URL`, `LLM_PRIMARY_MODEL` e `LLM_PRIMARY_API_KEY`. A API foi reiniciada após a alteração e o endpoint de saúde voltou a responder `200`.

## Validação

A validação final executa a suíte Vitest, a checagem TypeScript e o build de produção. O critério de aceite é que os três comandos terminem com código zero e que o endpoint `/healthz` continue respondendo `200` após o deploy.

O teste funcional do agente deve ser feito em uma obra real do usuário com os três mapeamentos MCP cadastrados. Para uma pergunta de leitura, a resposta deve conter a fonte local e os domínios MCP consultados. Nenhuma ferramenta de escrita deve aparecer no catálogo enviado à DeepSeek.

## Próxima etapa recomendada

O próximo incremento deve ser a criação controlada de uma obra iniciada por linguagem natural. Essa etapa deve reutilizar a prévia, o token de confirmação e a chave de idempotência já usados pelas mutações controladas. O agente não deve chamar diretamente uma ferramenta de escrita; ele deve produzir um plano de intenção para a UI confirmar.

## References

[1]: https://github.com/ragomes102030-cpu/plataforma-obras "Repositório da Plataforma Obras"
[2]: https://api.deepseek.com "API OpenAI-compatible da DeepSeek"
[3]: https://render.com/docs "Documentação do Render"
[4]: https://www.ofitexto.com.br/planejamento-e-controle-de-obras-2ed/p "Planejamento e controle de obras — Aldo Dórea Mattos, Oficina de Texto"
[5]: http://hdl.handle.net/11624/3815 "Pesquisa e aplicação da metodologia desenvolvida por Aldo Dórea Mattos sobre planejamento em obras da construção civil"
