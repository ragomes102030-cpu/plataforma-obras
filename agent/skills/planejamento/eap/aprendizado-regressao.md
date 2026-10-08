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
- **Status da interface live:** pendente de confirmação após o deploy Render associado ao merge 647726c59b31eb6609b0a541c47134b31a6b101f.
- **Próximo teste:** em OB-ZP1H2K, verificar a descrição/natureza/localização exibidas, editar e salvar um texto de escopo de QA, recarregar para confirmar persistência e perguntar ao Arquimedes o que foi declarado. Comparar com a EAP canônica e confirmar que nenhum nó/atividade foi criado ou alterado por salvar o escopo.

