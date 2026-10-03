# ARQUIMEDES — MATRIZ-MESTRA DE ENGENHARIA DE PLANEJAMENTO DE OBRAS

Versão 1.0.0 — 2026-10-03

## Objetivo
Esta matriz é o mapa técnico do Arquimedes. Ela governa Skills, MCPs, validadores, telas e integrações para que planejamento seja tratado como um sistema integrado de engenharia, e não como módulos isolados.

**Princípio:** entender → estruturar → decompor → quantificar → orçar → alocar recursos → sequenciar → programar → controlar → medir → diagnosticar → simular → replanejar → aprender.

## Domínios

| # | Domínio | Skill necessária | Dados/MCP | Validação | Estado |
|---|---|---|---|---|---|
| 01 | Estratégia e premissas | planejamento-geral | obra/documentos | coerência | EM EVOLUÇÃO |
| 02 | Escopo | engenharia-escopo | documentos | cobertura/rastreabilidade | EM EVOLUÇÃO |
| 03 | EAP/WBS | EAP | MCP EAP | estrutural/baseline | VALIDADO |
| 04 | Quantitativos | quantitativos | futuro MCP | rollup/rastreabilidade | PLANEJADO |
| 05 | Custos/orçamento | custos-obras | futuro MCP orçamento | cobertura/reconciliação | PLANEJADO |
| 06 | Produtividade | produtividade | custos/recursos/campo | coerência | PLANEJADO |
| 07 | Recursos | recursos | futuro MCP | capacidade/conflitos | PLANEJADO |
| 08 | Cronograma | cronograma | MCP Cronograma | rede/datas | EM EVOLUÇÃO |
| 09 | Caminho crítico | caminho-critico | Cronograma | folgas/cálculo | PLANEJADO |
| 10 | Gantt | visualizacao-planejamento | MCP Gantt | consistência | EM EVOLUÇÃO |
| 11 | Físico-financeiro | fisico-financeiro | custos+cronograma | reconciliação | PLANEJADO |
| 12 | Curva S | controle-curvas | custos+medição | consistência temporal | PLANEJADO |
| 13 | Valor agregado | valor-agregado | custos+medição | PV/EV/AC e índices | PLANEJADO |
| 14 | Curto prazo/lookahead | curto-prazo | campo+cronograma | restrições | PLANEJADO |
| 15 | Lean/Last Planner | lean-construction | campo+cronograma | compromissos/PPC | PLANEJADO |
| 16 | Riscos | riscos | riscos/documentos | respostas/gatilhos | PLANEJADO |
| 17 | Suprimentos | suprimentos | futuro MCP | lead time/dependências | PLANEJADO |
| 18 | Contratos | contratos-obras | contratos | rastreabilidade | PLANEJADO |
| 19 | Medição | medicao | futuro MCP | EAP↔medição↔evidência | PLANEJADO |
| 20 | Controle da produção | controle-producao | campo+cronograma | planejado×realizado | PLANEJADO |
| 21 | Replanejamento | replanejamento | cronograma+custos+riscos | antes/depois | PLANEJADO |
| 22 | Mudanças | controle-mudancas | projeto/contrato | aprovação/auditoria | EM EVOLUÇÃO |
| 23 | Qualidade | qualidade-obras | futuro MCP | evidência/fechamento | PLANEJADO |
| 24 | Segurança | seguranca-planejamento | documentos/campo | restrições/evidência | PLANEJADO |
| 25 | BIM 4D/5D | bim-planejamento | futuro MCP BIM | modelo↔EAP | FUTURO |
| 26 | Diário de obra | diario-obra | futuro MCP campo | evidência temporal | FUTURO |
| 27 | Restrições | restricoes | campo+cronograma | status/impacto | PLANEJADO |
| 28 | Cenários | simulacao-planejamento | módulos integrados | premissas explícitas | FUTURO |
| 29 | Auditoria | auditoria | plataforma | trilha | EM EVOLUÇÃO |
| 30 | Memória/aprendizado | aprendizado-regressao | cérebro | regressão | VALIDADO |
| 31 | Governança | governanca-planejamento | plataforma | aprovação/permissão | EM EVOLUÇÃO |
| 32 | Multimétodo | engenharia-planejamento | biblioteca | fonte/método | PLANEJADO |
| 33 | Tipos de obra | especializacao-obra | biblioteca/projeto | regras por tipologia | PLANEJADO |
| 34 | Pós-obra | aprendizado-pos-obra | campo/medição | lições/evidência | FUTURO |

## Cinco níveis de conhecimento

### A — Fundamentos
Escopo, premissas, restrições, EAP, decomposição, pacotes de trabalho e dicionário.

### B — Planejamento determinístico
Quantidades, custos, produtividade, recursos, atividades, durações, calendários, predecessoras, cronograma e caminho crítico.

### C — Integração
EAP↔orçamento, EAP↔cronograma, EAP↔recursos, EAP↔medição, cronograma↔custos, cronograma↔suprimentos, riscos↔cronograma e mudanças↔baseline.

### D — Controle e produção
Planejado×realizado, medição, diário, restrições, lookahead, Last Planner, PPC, curva S, valor agregado e recuperação.

### E — Inteligência
Auditoria, engenharia reversa, cenários, simulação, revisão especialista, previsão baseada em evidências e aprendizado entre obras.

## Arquitetura Skill × MCP

**Skill = conhecimento, método e procedimento.**  
**MCP = acesso a dados e execução determinística.**

Uma Skill pode ser independente, híbrida ou mcp_assistida. MCP nunca substitui validação e nenhuma Skill/MCP autoriza mutação.

MCPs previstos:
EAP, Cronograma, Gantt, Orçamento, Quantitativos, Recursos, Suprimentos, Medição, Campo/Diário, Qualidade, BIM e Riscos.

## Quatro camadas de validação

1. **Estrutural:** dados e relações.
2. **Engenharia:** regras do domínio.
3. **Integração:** módulos compatíveis entre si.
4. **Governança:** revisão, aprovação e autorização.

EAP válida não significa cronograma válido. Cronograma válido não significa orçamento compatível. Planejamento válido não significa alteração autorizada.

## Rastreabilidade-alvo

**Obra → EAP → Pacote → Quantidade → Custo → Recurso → Atividade → Predecessora → Marco → Medição → Evidência → Desvio → Decisão → Aprovação → Aplicação**

Lacunas relevantes devem virar achados.

## Modos do Arquimedes

- **Criar:** construir proposta.
- **Auditar:** procurar inconsistências.
- **Simular:** comparar cenários sem mutação.
- **Controlar:** comparar plano, execução e evidências.

## Autocorreção controlada

Falha → evidência → classificação → correção → validação → nova tentativa limitada → proposta corrigida → aprendizado candidato → regressão.

Autocorreção nunca autoriza aplicação.

## Hierarquia de autoridade

1. Dados atuais da obra.
2. Contratos/documentos aplicáveis.
3. Regras determinísticas.
4. Referências técnicas selecionadas.
5. Memória validada.
6. Hipótese da IA.

Memória histórica nunca substitui evidência atual.

## Ondas de evolução

**Onda 1 — Planejamento:** Skill mestre, arquitetura, auditoria, visualização, catálogo de regras e validações.

**Onda 2 — Cronograma:** atividades, duração, calendários, predecessoras, caminho crítico, Gantt e integração EAP↔cronograma.

**Onda 3 — Custos:** quantitativos, orçamento, produtividade, recursos e EAP↔orçamento.

**Onda 4 — Controle:** medição, físico-financeiro, curva S, valor agregado e planejado×realizado.

**Onda 5 — Produção:** restrições, lookahead, Last Planner, PPC e diário.

**Onda 6 — Inteligência:** cenários, riscos, suprimentos, BIM 4D/5D, previsão e aprendizado entre obras.

## Critério de maturidade

Um domínio só será considerado coberto quando possuir conhecimento/Skill, dados, ferramenta quando aplicável, validação, revisão humana, auditoria, regressão e integração com dependências.

**Tela ou endpoint sozinho não significa domínio coberto.**

## Regra permanente

Antes de criar qualquer módulo, responder:

1. Qual domínio da matriz?
2. Qual Skill?
3. Quais dados?
4. Qual MCP/serviço?
5. Qual validador?
6. Como integra?
7. Como o engenheiro revisa?
8. Como aprova?
9. Como audita?
10. O que será aprendido e protegido por regressão?

Se essas respostas não existirem, o módulo ainda não está arquitetado.
