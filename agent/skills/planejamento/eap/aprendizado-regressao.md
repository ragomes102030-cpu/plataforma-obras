# Skill: aprendizado e regressão da EAP

## Propósito
Transformar falhas e descobertas da EAP em conhecimento reutilizável sem permitir que uma observação isolada altere o comportamento global.

## Modo
INDEPENDENTE — não depende de MCP. Pode receber evidência produzida por validadores locais, QA, MCPs ou revisão humana.

## Ciclo
observação -> evidência -> candidato -> validação -> regra validada -> regressão.

## O aprendizado deve registrar
- problema observado;
- causa classificada;
- correção;
- evidência;
- escopo;
- confiança;
- teste de regressão;
- status.

## Regra
Fixture defeituosa não é automaticamente defeito de produção. Antes de criar uma regra, separar produto, contrato, ambiente, MCP e fixture.


## Regressão QA — proposta EAP com contrato parcial (2026-10-08)
- **Problema observado:** ao abrir uma obra QA sem EAP e clicar em “Gerar proposta com Arquimedes”, a interface caiu no ErrorBoundary com `Cannot read properties of undefined (reading 'filter')`.
- **Causa classificada:** contrato de UI permissivo demais para o retorno de `eapArquimedesReview/analisarEapComArquimedes`; a proposta pode existir sem algumas coleções opcionais e o componente tratava `nodes` e outras listas como sempre definidas.
- **Correção:** normalizar `nodes`, `basis`, `assumptions`, `missingInformation` e `validation.issues` para listas vazias antes de usar `length`, `map` ou `filter`.
- **Evidência:** reprodução determinística em QA via Playwright; stack apontou o componente `AbaEap`, função de cálculo de estatísticas da proposta, durante `useMemo`.
- **Escopo:** somente interface da proposta inicial da EAP; não altera dados da AURORA.
- **Teste de regressão:** reproduzir geração da proposta com payload parcial e verificar ausência de erro de página/ErrorBoundary; depois validar proposta completa e fluxo de aprovação.
- **Status:** correção commitada na branch `develop`; aguardando publicação no ambiente oficial para regressão E2E.


## Regressão live — snapshot canônico e proposta longa truncada (2026-10-08)
- **Problema observado A:** mensagens antigas do chat afirmavam que a EAP da obra QA `OB-ZP1H2K` tinha zero nós, embora a tela e o banco local exibissem 9 nós persistidos.
- **Causa classificada A:** o contexto do agente não incluía a árvore EAP completa; o histórico de chat podia contaminar a leitura do estado atual.
- **Correção A:** incluir no contexto do agente um snapshot canônico da EAP vindo da fonte de dados atual e instruir explicitamente que o snapshot atual prevalece sobre mensagens antigas.
- **Evidência A:** teste autenticado via Playwright no ambiente live; Arquimedes leu os 9 nós atuais (raiz + 8 pacotes), listou códigos e nomes, informou 0 atividades e 0 dependências e declarou que a leitura antiga de 0 nós estava superada. Deploy live associado ao commit `34828bcab4df8f9230aad001e4c58e155b7aea12`.
- **Problema observado B:** uma proposta textual extensa foi interrompida no meio da linha `C2.2`, sem fechar a análise; o chat permaneceu mostrando estado de processamento por dezenas de segundos. A continuação solicitada em uma segunda mensagem foi concluída com os grupos restantes e os gates de aprovação.
- **Causa classificada B:** limitação de conclusão/segmentação da resposta longa no fluxo do agente/UI (causa técnica exata ainda não isolada; não atribuir a banco ou provedor sem logs conclusivos).
- **Regra candidata:** propostas longas de EAP devem ser entregues em blocos finitos e retomáveis; cada resposta deve fechar a seção, explicitar o próximo bloco e nunca se apresentar como proposta completa se foi truncada. O agente deve verificar que o texto termina com a conclusão/gates esperados.
- **Evidência B:** captura da resposta live mostrou truncamento após `C2.2`; a continuação retomou em `C2.2` e cobriu C2–C11, regra dos 100%, sobreposições e gates.
- **Escopo:** somente obra de QA `OB-ZP1H2K`; AURORA TESTE não foi aberta para edição nem modificada.
- **Status A:** correção do snapshot confirmada em live.
- **Status B:** mitigação operacional testada (resposta dividida em blocos); causa raiz e regressão automatizada ainda pendentes.
- **Próximo teste:** validar que o agente entrega propostas longas em blocos sem truncamento e que o UI deixa claro quando há continuação pendente; adicionar teste de integração com saída artificialmente longa e finalização verificável.
## Regressão live — escopo declarado não chegava à EAP (2026-10-08)

- **Problema observado:** a aba Escopo exibia apenas quatro indicadores genéricos derivados das linhas do cronograma; não apresentava a descrição formal cadastrada na obra e não permitia editá-la. Uma obra sem atividades parecia não ter escopo, mesmo quando a descrição havia sido fornecida na criação.
- **Problema adicional:** o formulário de nova obra coletava a natureza da obra (tipoDeObra), mas projects.create não a persistia.
- **Falha de contexto do agente:** o registro de projeto continha descricao e tipoDeObra, porém AgentProjectContext/formatContext não os incluía na leitura enviada ao Arquimedes.
- **Correção implementada no PR #72:** adicionar projects.updateScope usando colunas existentes (location, tipoDeObra, descricao), exibir e editar a descrição declarada na aba Escopo, persistir a natureza da obra na criação e incluir os campos no contexto do agente. O agente deve preservar a distinção entre fato declarado, premissa e dado ausente; frentes derivadas do cronograma não substituem o escopo formal.
- **Segurança:** sem migração de banco; não regenerar a EAP, não criar atividades, não aprovar baseline e não alterar OB-PUPOCN — AURORA TESTE para corrigir esta classe de problema.
- **Validação automatizada:** CI passou typecheck, testes e build na branch do PR. A regressão live da Aurora foi marcada como sucesso, mas a etapa que acessaria o Supabase foi ignorada por ausência do segredo SUPABASE_DB_URL; não interpretar isso como validação live de dados da Aurora.
- **Status da interface live:** confirmado. O cadastro de escopo foi editado no projeto QA, persistiu após recarregar e o agente live passou a informar natureza `edificio`, descrição declarada e lacunas registradas mesmo com `mcp_sem_vinculo`. Deploy final: `dep-db42jt8473hc73ceatm0`, commit `eb6ebe311064c629d1751af387e43e1b15702271`. Snapshot EAP permaneceu com 9 nós (1 raiz + 8 pacotes), 0 atividades e 0 dependências locais; nenhuma alteração na árvore foi feita.
- **Próximo teste:** em OB-ZP1H2K, verificar a descrição/natureza/localização exibidas, editar e salvar um texto de escopo de QA, recarregar para confirmar persistência e perguntar ao Arquimedes o que foi declarado. Comparar com a EAP canônica e confirmar que nenhum nó/atividade foi criado ou alterado por salvar o escopo.

## Fechamento de ciclo — fallback local da EAP e segurança Supabase (2026-10-09)

### Evidência observada
- Obra de QA: `OB-ZP1H2K — QA EAP SCOPE 2026-10-08`. A fonte canônica local tem 9 nós (1 raiz + 8 folhas), todos em rascunho; 0 atividades, 0 dependências, 0 versões de orçamento e 0 baselines.
- Escopo textual local está acessível: edifício residencial multifamiliar de seis pavimentos; inclui fundações/contenções, estrutura de concreto armado, vedações/alvenarias, instalações elétricas e hidrossanitárias, revestimentos/acabamentos, áreas externas, comissionamento, documentação e entrega.
- Não há itens estruturados de escopo nem vínculos escopo↔EAP. Por isso, a regra dos 100% deve ficar **indecidível** (não aprovada nem reprovada).
- 8/8 folhas sem responsável, 0/8 com unidade, 0/8 com quantidade e cobertura do dicionário 0%.
- Os 3 serviços MCP estavam online (EAP 24 ferramentas, Cronograma 15, Gantt/LOB 7), mas `OB-ZP1H2K` não aparece na coleção externa do MCP de EAP e não tem linha em `project_mcp_integrations`. Saúde do servidor não significa vínculo de obra.
- Teste funcional real executou `get_eap_tree`, `validar_estrutura`, `pacotes_sem_dono`, `resumo_quantitativos`, `listar_escopo` e `validar_regra_100_porcento` por fallback local; nenhuma mutação foi realizada. A validação estrutural retornou 0 bloqueios/0 avisos, mas isso **não** torna a EAP pronta para aprovação.

### Correções e regressões
- PR #77: a Central de Comando parou de fixar `mcpDomains=[]` e passou a exibir o estado real dos 3 MCPs. Teste live confirmou 3/3 online e 46 ferramentas totais.
- PR #78: sem vínculo MCP, consultas somente-leitura de EAP usam o snapshot local; `validar_regra_100_porcento` retorna `indecidivel` sem denominador auditável; ferramentas mutáveis continuam bloqueadas.
- PR #79: `get_eap_tree` retorna o snapshot original e não inventa `projectId: 0` nem `externalId`. O ID sintético apareceu no primeiro teste de fallback e foi tratado como regressão, não como fato da obra.
- Verificações: esbuild do servidor/testes, `git diff --check`, harness direto do fallback e smoke test live da Central de Comando/EAP. A suíte Vitest completa não foi executada neste ambiente devido ao limite de memória durante a instalação de dependências.

### Mitigação de exposição pública no Supabase
- Foi detectado que 37 tabelas do schema `public` estavam com RLS desabilitado e os papéis `anon`/`authenticated` tinham privilégios DML.
- Mitigação aplicada: revogação de privilégios de tabelas e sequências para `anon`/`authenticated`, revogação de EXECUTE de funções para `PUBLIC`, `anon` e `authenticated`, e alteração dos privilégios padrão de funções para o owner `postgres`.
- Verificação posterior: 0 tabelas com DML para `anon`, 0 para `authenticated`; 0 sequências acessíveis a esses papéis; 0 funções públicas executáveis por esses papéis. O papel de servidor `arquimedes_app` manteve leitura/gravação necessárias; smoke test live passou.
- **Limitação residual:** RLS continua desabilitado nas tabelas. A exposição via privilégios públicos foi mitigada; não declarar que uma política RLS completa foi implantada. Planejar políticas por usuário/projeto com testes antes de ativar RLS em massa.

### Regras permanentes
1. Sempre separar saúde do MCP, existência do projeto externo e vínculo local de integração.
2. Preferir leitura/validação local quando existir snapshot canônico; nunca inventar IDs externos ou preencher com `default`.
3. Estrutura válida, dicionário completo, regra dos 100%, aprovação e baseline são gates distintos.
4. Não criar projeto externo nem salvar mapeamento automaticamente só para remover `mcp_sem_vinculo`; exige decisão e autorização explícita.
5. Antes de planejar atividades, fechar itens estruturados de escopo, eixo de decomposição e dicionário; manter a árvore em rascunho até revisão formal.
6. AURORA TESTE permaneceu intocada durante esta rodada.


## Proposta de escopo estruturado e EAP candidata — QA OB-ZP1H2K (2026-10-09)

- **Objetivo:** transformar a descrição textual já declarada em base estruturada de revisão, sem alterar a EAP persistida.
- **Fatos do escopo textual:** edifício residencial de seis pavimentos; a descrição inclui fundações/contenções, estrutura de concreto armado, vedações/alvenarias, instalações elétricas e hidrossanitárias, revestimentos/acabamentos, áreas externas, comissionamento, documentação e entrega.
- **Fatos ainda ausentes:** área construída, número/tipologia de unidades, convenção de contagem dos pavimentos, existência de subsolo/garagem/elevadores/cobertura técnica, especificações detalhadas, quantitativos, orçamento, datas e responsáveis. Sistemas adicionais como gás, incêndio, telecomunicações, climatização e energia solar não estão confirmados.
- **Correção de método:** distinguir “item declarado no escopo textual” de “item estruturado, delimitado e rastreado”. Não reclassificar como desconhecido o que foi explicitamente declarado; também não inferir especificações, quantidades, sistemas adicionais ou limites contratuais a partir do nome genérico do item.
- **Proposta versionada:** `docs/QA-OB-ZP1H2K-ESCOPO-EAP-PROPOSTA-2026-10-09.md`. A árvore ali é candidata para revisão, com códigos provisórios; não representa nós persistidos nem aprovação de engenharia.
- **Gate da regra dos 100%:** permanece `indecidivel` enquanto não houver itens estruturados de escopo e vínculos auditáveis escopo↔EAP. Nove nós e zero bloqueios estruturais não provam cobertura do escopo.
- **Proteções:** não criar atividades, dependências, orçamento, baseline, projeto externo ou vínculo MCP; não executar regeneração destrutiva; não alterar `OB-PUPOCN — AURORA TESTE`.
- **Status:** documento de proposta preparado no branch `docs/qa-escopo-eap-proposta-2026-10-09`; revisão técnica/PR pendente. Nenhuma mutação no banco foi executada nesta etapa.
- **Regressões:** (1) preservar itens explicitamente declarados; (2) marcar especificações/quantidades ausentes como desconhecidas; (3) regra dos 100% indecidível sem denominador e vínculos; (4) proposta não escreve na EAP persistida; (5) nenhum efeito na AURORA.
