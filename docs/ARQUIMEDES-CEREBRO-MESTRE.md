# ARQUIMEDES — CÉREBRO MESTRE DO SISTEMA

Documento canônico de continuidade do projeto. Objetivo: permitir que qualquer IA, agente, engenheiro ou desenvolvedor entenda rapidamente o estado, as regras, as decisões e os aprendizados do Arquimedes sem depender do histórico de um chat.

Projeto: plataforma-obras
Agente: Arquimedes
Repositório: ragomes102030-cpu/plataforma-obras
Branch operacional: develop
Última consolidação: 2026-10-03

## 1. O que é o Arquimedes
Arquimedes é o agente de engenharia da plataforma de gestão de obras. Ele recebe contexto, consulta dados/documentos/MCPs, analisa, propõe, valida contratos, registra evidências e decisões e só aplica mudanças quando o fluxo de aprovação autorizar.

Regra fundamental: proposta textual não é alteração aplicada.

## 2. Arquitetura do cérebro
O cérebro possui três camadas conceituais:
- Memória global/biblioteca: regras, padrões validados, aprendizados, procedimentos e referências reutilizáveis.
- Memória da obra: decisões, fatos, premissas, pendências, propostas, restrições e evidências específicas.
- Memória de execução: requestId, status, contexto, resultado, erros, iterações, eventos e checkpoints.

Memória de execução é evidência histórica; nunca é autorização de mutação.

## 3. Memória persistente já implementada
Arquivo principal: server/agent/memory.ts
Tabela: agent_memories
Escopos: project, client, library
Confiança: high, medium, low
Status: proposed, approved, rejected, obsolete
Fontes: engenheiro, obra, documento, MCP, pesquisa externa, Arquimedes e sistema.

A memória é persistente, estruturada e recuperável por obra e busca textual.

## 4. Continuidade histórica
buildArquimedesMemoryContext recupera execuções anteriores de agent_runs quando ainda não existe memória estruturada. O histórico é registrado como contexto e deve ser confirmado contra os dados atuais.

## 5. Fluxo de execução
entrada -> contexto -> análise -> proposta -> validação de contrato -> checkpoint -> aprovação -> aplicação -> auditoria -> memória

Estados desejados de proposta: draft -> validated -> under_review -> approved -> applied.
Estados de interrupção: rejected e invalid.
Nenhuma proposta deve ser considerada formalmente aprovada sem validação e confirmação explícitas.

## 6. Contratos críticos
resolutionSummary[*] possui limite de 600 caracteres.
descricao de proposta/EAP possui limite de 4000 caracteres.
O Arquimedes deve compactar saídas antes da validação. Se o provedor entregar conteúdo inválido sem recuperação segura, registrar falha e não aplicar alteração.

## 7. Checkpoint operacional
O checkpoint persistente registra type, requestId, status, stage, summary, blockerCount, openFindings, approvedDecisions, formalProposalRecorded, changesApplied, readOnlyExecution, iterations, errorCode, errorMessage e recordedAt.
Diagnóstico não é alteração.

## 8. Modo somente leitura
readOnly agora representa o modo efetivo: readOnly = !allowMutations.
Uma execução QA sem permissão de mutação deve ser registrada como somente leitura.

## 9. EAP — regras consolidadas
Validações existentes incluem: árvore válida, pai existente, ausência de órfãos, códigos WBS únicos, ausência de ciclos, compatibilidade pai/filho, nível/código, entregáveis sem filhos, cobertura de custos, regra de 100%, ausência de dupla contagem, grupos com custo, dicionário, cobertura de escopo, sobreposição de escopo, coerência de decomposição e rollup de quantidades.

Baseline é mais rigoroso que rascunho.
Folhas para baseline exigem: descrição, inclusões, exclusões, responsável, critérios de aceitação e base de decomposição.

## 10. EAP não é cronograma
A EAP define escopo e decomposição. O cronograma organiza atividades, duração e dependências. A ligação entre pacote de trabalho, atividade e predecessoras precisa ser explícita.

## 11. Fluxo EAP com engenheiro
1. Cliente descreve a obra.
2. Arquimedes propõe a EAP.
3. Engenheiro revisa e edita.
4. Arquimedes analisa a versão revisada.
5. Arquimedes e Euclides podem apresentar concordância/divergência técnica.
6. A decisão é registrada.
7. Somente confirmação explícita permite avançar para aplicação.
8. Aplicação gera auditoria.
9. Resultado validado pode alimentar o cérebro.

## 12. MCPs
MCPs relevantes: EAP, Cronograma e Gantt.
Respostas de MCP são dados externos sujeitos a contrato, disponibilidade, timeout, rate limit e validação.
Erro de MCP não deve ser escondido.
Durante QA já foi observado 429 Too Many Requests em EAP/Cronograma; isso é uma condição real de falha controlada.

## 13. EAP MCP
O EAP MCP possui contrato próprio e não possui resolutionSummary. Campos observados incluem descricao, criterio_medicao, responsavel, disciplina, nao_aplicavel, motivo_na, status, revisao, motivo, origem_uid, parent_id, nivel, frente_id, local_id, tipo_frente, nome, unidade e quantidade.
Conclusão: limites de resolutionSummary pertencem ao contrato do Arquimedes/orquestrador, não ao EAP MCP.

## 14. QA
Existe infraestrutura de QA com runner, suites, projeto isolado, fixture E2E, logs e checkpoint.
Regra operacional obrigatória: GitHub -> Render -> confirmar LIVE -> testar -> validar.
Nunca declarar teste funcional como aprovado sem evidência real.

## 15. Fixture E2E atual
Projeto: ARQUIMEDES-E2E-001
Nome: Residência Unifamiliar QA — Fluxo E2E
Local: Eusébio/CE
Tipo: residencial_unifamiliar
Estado inicial: draft
Estrutura: 22 nós EAP, 12 pacotes e 12 atividades.
Orçamento: R$ 339.015.

Último E2E observado: 14/14 verificações aprovadas.
Passaram: projeto, estrutura EAP, escopo, baseline, dicionário, cobertura de custos, ausência de dupla contagem, EAP/cronograma, IDs únicos, predecessoras, ausência de auto-dependência, quantidades positivas, fluxo de aprovação e ausência de aplicação implícita.

## 16. Aprendizado da falha da fixture
O baseline inicialmente falhou por eap_scope_overlap_evidence na própria fixture.
Conclusão: não era defeito comprovado do validador. A fixture foi corrigida, houve novo deploy e o E2E passou 14/14.
Regra de engenharia: antes de alterar produção, determinar se a falha está no produto, contrato, ambiente ou fixture.

## 17. Aprendizados permanentes
- Limites de contrato devem ser tratados no contrato/orquestrador.
- Execução sem mutação deve declarar readOnly efetivo.
- Baseline é mais rigoroso que rascunho.
- A regra de sobreposição de escopo deve continuar ativa.
- 429 é falha operacional real e deve ser diagnosticada/controlada.
- Proposta textual nunca equivale a aplicação.
- Histórico pode recuperar continuidade, mas não autoriza mutação.
- Obras fictícias devem exercitar casos válidos e inválidos antes de clientes reais.

## 18. Matriz de regressão desejada
Testar: resolutionSummary > 600; descricao > 4000; pai inválido; código duplicado; ciclo; entregável com filhos; dicionário incompleto; sobreposição de escopo; 100% rule/rollup; cobertura de custos; dupla contagem; MCP indisponível; rate limit; divergência Arquimedes/Euclides; tentativa sem aprovação; aplicação antes da aprovação; auditoria; memória; múltiplos tipos de obra; continuidade sem copiar prompts manualmente.

## 19. Aprendizado futuro controlado
Fluxo: teste -> evidência -> candidato -> validação -> regra validada -> regressão.
Registrar: resultado, evidência/origem, escopo global/project_type/project, confiança, status candidate/validated/rejected, regra derivada, primeira ocorrência, última ocorrência, ocorrências, validador e teste de regressão.
Nunca permitir que uma observação isolada reescreva silenciosamente uma regra global.

## 20. Skills como camada de conhecimento
Skills são conhecimento profissional versionado e separado da infraestrutura de ferramentas.
Cada skill declara modo de execução:
- independente: não depende de MCP;
- híbrida: pode trabalhar com contexto local e usar MCP apenas quando necessário;
- mcp_assistida: depende de evidência obtida por MCP para completar sua função.

Skills não têm permissão de mutação. MCPs também não autorizam aplicação por si só.
Skills podem ser compostas entre si e podem solicitar MCPs de forma direcionada.

Skills EAP atuais incluem decomposição, regra dos 100%, pacotes de trabalho, critérios de parada, validação, revisão colaborativa e aprendizado/regressão.

## 21. Aprendizado estruturado
Aprendizados candidatos podem ser registrados na memória persistente com o ciclo:
observação -> evidência -> candidato -> validação -> regra validada -> regressão.

O registro de aprendizado guarda problema, evidências, regra proposta, escopo, confiança e teste de regressão. O status inicial é candidato/proposto. Só uma validação posterior pode transformar o conhecimento em regra confiável.

## 22. Como qualquer IA deve iniciar
1. Ler este documento.
2. Identificar branch e estado atual.
3. Consultar memória persistente relevante.
4. Consultar checkpoints/executions quando necessário.
5. Separar fato, proposta, hipótese e aprendizado.
6. Verificar o código atual antes de afirmar que algo existe.
7. Respeitar aprovação.
8. Nunca inventar estado de produção.
9. Executar mudanças pelo fluxo GitHub -> Render -> LIVE -> teste -> validação.
10. Atualizar este cérebro quando surgir aprendizado estrutural.

## 23. Estado atual
Já existe: Arquimedes, orquestração, execução assíncrona, eventos, checkpoint, memória V1, recuperação histórica, capacidades, MCPs, validação EAP, baseline, QA Runner, QA Suite, fixture E2E e fluxo de aprovação como princípio.

Já validado em execução real: limites de resolutionSummary/descricao, modo readOnly, ausência de aplicação no QA, EAP estrutural, escopo, baseline, dicionário, custos, EAP/cronograma, aprovação explícita e E2E 14/14.

Ainda precisa evoluir: fluxo completo Arquimedes -> Euclides -> MCP -> proposta -> revisão -> aprovação -> aplicação; persistência completa de decisões; aprendizagem validada; matriz de regressão completa; continuidade automática entre LLMs; mais cobertura de falhas dos MCPs; múltiplos tipos de obra.

## 24. Regra de ouro
O cérebro registra o que foi aprendido.
A validação determina o que é confiável.
A aprovação determina o que pode mudar.
A auditoria registra o que realmente mudou.
Nenhuma IA deve substituir essas quatro etapas por uma resposta textual.

Histórico desta consolidação: evolução acumulada até 2026-10-03.

## 25. Aprendizado Aurora — IDs de EAP entre versões
Incidente real de teste na obra fictícia OB-PUPOCN — AURORA TESTE.

Evidência:
- A revisão do Arquimedes continha atualizações com nodeIds internos de uma versão anterior da EAP (ex.: 2561, 2562, 2563...).
- Esses IDs não existiam na versão atual, gerando 31 erros do tipo "a proposta tenta atualizar um nó que não existe na EAP atual".
- A EAP aprovada não foi considerada inválida por esse fato; o defeito estava na reconciliação da proposta/versionamento.

Regra validada:
- IDs internos de WBS/EAP são específicos da versão e não são referência estável entre versões.
- Ao reconciliar proposta com a versão atual:
  1. nodeId existente na versão atual tem prioridade;
  2. nodeId inexistente pode ser reconciliado pelo código WBS/EAP estável, se houver correspondência única na versão atual;
  3. se ID e código não puderem ser resolvidos com segurança, a proposta deve continuar bloqueada;
  4. revisão pertencente a versão superseded deve ser descartada da apresentação como revisão atual.
- Reconciliar não significa aplicar alteração.

Proteção:
- Validador em `server/construction/eap-validator.ts`.
- Regressão em `server/construction/eap-validator.test.ts`.
- Revisões de versão anterior são invalidadas por `baseVersionId`.

Status: regra implementada e protegida por regressão; teste funcional Aurora após o novo deploy ainda deve ser confirmado.
Escopo: global para propostas EAP versionadas.
Origem: Aurora Teste / OB-PUPOCN.
