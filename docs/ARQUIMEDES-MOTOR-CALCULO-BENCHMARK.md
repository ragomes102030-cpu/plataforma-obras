# ARQUIMEDES — Benchmark do Motor de Cálculo de Planejamento

**Status:** referência técnica inicial  
**Data:** 2026-10-03  
**Escopo:** motor determinístico de cálculo para planejamento e controle de obras  
**Ambientes:** ARQUIMEDES-QA + Aurora Teste

## 1. Objetivo

Definir, antes da implementação, como o motor de cálculo do Arquimedes deverá tratar quantidade, produtividade, duração, calendário, recursos, precedências, CPM, folgas e custos.

O motor será determinístico e separado do LLM. Arquimedes interpreta contexto, solicita cálculos e apresenta propostas; o motor calcula; validadores verificam; aprovação humana autoriza aplicação.

## 2. Benchmark externo

### Oracle Primavera P6

A documentação oficial do P6 trata atividades como elementos fundamentais de trabalho e associa a elas duração, calendário, tipo de duração, recursos, restrições, despesas, WBS e relacionamentos predecessor/sucessor. Os relacionamentos formam a lógica da rede e, combinados com as durações, determinam as datas do cronograma.

O P6 suporta Finish-to-Start, Finish-to-Finish, Start-to-Start e Start-to-Finish. Também possui calendários de atividade/recurso, recursos de mão de obra, material e não mão de obra, disponibilidade, preços e alocação às atividades.

O cálculo de caminho crítico não é reduzido a uma única regra: o P6 permite trabalhar com total float, longest path e múltiplos caminhos de float. Também possui verificações de saúde do cronograma, incluindo lógica sem predecessores/sucessores e lags negativos.

**Fontes oficiais:**
- Oracle P6 — Activities: https://docs.oracle.com/cd/F25600_01/English/User_Guides/p6_pro_user/activities.htm
- Oracle P6 — Relationships: https://docs.oracle.com/cd/G48902_01/English/User_Guides/p6_pro_user/relationships.htm
- Oracle P6 — Resources: https://docs.oracle.com/cd/G48902_01/English/User_Guides/p6_pro_user/18823.htm
- Oracle P6 — Activity durations: https://docs.oracle.com/cd/G18296_01/English/User_Guides/p6_pro_user/enter_activity_durations.htm
- Oracle P6 — Schedule options: https://docs.oracle.com/cd/G48897_01/p6help/en/99348.htm
- Oracle P6 — Schedule health checks: https://docs.oracle.com/cd/G48897_01/p6help/en/91574.htm

## 3. Procore

A documentação oficial do Procore mostra integração entre estimativa, takeoff, orçamento, custos, cronograma e recursos. O sistema conecta quantidades de takeoff a estimativas, utiliza dados históricos para validar premissas e conecta estimativa ao orçamento e às fases posteriores.

Na gestão de recursos, o Procore relaciona mão de obra, equipamentos, produtividade e custos. O acompanhamento de campo pode comparar produção real com taxas originalmente estimadas.

No cronograma, o Procore integra cronogramas existentes, inclusive P6 e Microsoft Project, e conecta programação com dados de campo e custos.

**Fontes oficiais:**
- Procore Estimating: https://www.procore.com/estimating
- Procore Resource Management: https://www.procore.com/resource-management
- Procore Scheduling: https://www.procore.com/project-management/schedule
- Procore Financial Management: https://www.procore.com/financial-management

## 4. Autodesk Forma / Construction

A documentação oficial da Autodesk mostra integração entre dados de cronograma, custo e modelos BIM. O Forma permite importar cronogramas de Primavera P6, Microsoft Project e ASTA Powerproject e conectar programação a custo para planejamento de custos relacionados ao tempo e fluxo de caixa.

A plataforma também apresenta quantificação 2D/3D, estimativa e simulação 4D/5D como capacidades relacionadas ao planejamento.

**Fontes oficiais:**
- Autodesk Forma — Construction Project Management: https://construction.autodesk.com/workflows/construction-project-management/
- Autodesk Forma — Schedule: https://construction.autodesk.com/tools/schedule/
- Autodesk Forma — capabilities/pricing: https://construction.autodesk.com/pricing/
- Autodesk — BIM for Construction: https://www.autodesk.com/solutions/aec/bim/bim-for-construction

## 5. Padrões que o Arquimedes deve incorporar

### 5.1 Atividade não é apenas nome + duração

Cada atividade calculável deverá ter, quando aplicável:

- identificação;
- vínculo com EAP/WBS;
- quantidade;
- unidade;
- produtividade;
- recurso/equipe;
- calendário;
- duração planejada;
- predecessoras/sucessoras;
- tipo de relacionamento;
- lag;
- restrições;
- custos;
- fonte dos dados;
- evidências;
- versão da fórmula;
- resultado calculado;
- warnings/erros de validação.

### 5.2 Duração deve ser calculada, não inventada

Quando houver quantidade e produtividade compatíveis:

**duração = quantidade / produtividade**

Mas o motor nunca deve transformar ausência de produtividade em duração artificial.

durationDays = 0 em Aurora significa **dado ausente**, não uma atividade de duração zero.

### 5.3 Calendário é parte do cálculo

A duração numérica não deve ser convertida diretamente em datas sem considerar calendário de trabalho. O motor deverá separar:

- duração em unidade de trabalho;
- calendário;
- data de início;
- data de término;
- feriados/exceções;
- eventual calendário de recurso.

### 5.4 Recursos precisam participar do modelo

O benchmark do P6 mostra que recursos possuem disponibilidade, calendário, unidade de medida e preço, e podem ser associados às atividades.

No Arquimedes, isso será separado de produtividade: produtividade informa capacidade de produção; recurso informa quem/o que executa e suas restrições/custos.

### 5.5 Rede lógica precisa ser explícita

O motor deverá suportar inicialmente:

- FS — Finish to Start;
- SS — Start to Start;
- FF — Finish to Finish;
- SF — Start to Finish;
- lag.

Não será permitido inferir uma dependência apenas pela ordem visual das atividades.

### 5.6 CPM não será apenas uma coluna “crítica”

O motor deverá calcular pelo menos:

- ES;
- EF;
- LS;
- LF;
- total float;
- free float;
- caminho determinante;
- atividades críticas conforme regra configurada;
- caminhos subcríticos quando suportados.

A regra de criticidade deverá ser explícita e versionada.

### 5.7 Validação de cronograma será um módulo próprio

Antes do cálculo final, validar:

- ciclos;
- atividades sem lógica quando deveriam estar conectadas;
- predecessoras inexistentes;
- sucessoras inexistentes;
- auto-dependência;
- lags inválidos;
- durações ausentes;
- calendários inexistentes;
- unidades incompatíveis;
- recursos indisponíveis;
- restrições conflitantes;
- atividades órfãs;
- datas impossíveis.

## 6. Arquitetura decidida

**Arquimedes**
→ interpreta a solicitação e contexto

**Skills**
→ fornecem método e regras

**MCPs**
→ fornecem dados/execução externa quando necessário

**Calculation Engine**
→ executa fórmulas determinísticas

**Validators**
→ verificam consistência

**Proposal**
→ registra resultado sem aplicação

**Engineer**
→ revisa e aprova

**Application**
→ altera estado somente após autorização

**Audit + Memory**
→ registram resultado, evidência e aprendizado

## 7. Contrato mínimo de cada cálculo

Todo cálculo relevante deverá carregar:

- calculationId
- calculationType
- formula
- formulaVersion
- inputs
- units
- assumptions
- source
- evidenceRefs
- result
- resultUnit
- status
- warnings
- errors
- calculatedAt

Isso permite responder posteriormente: **“de onde veio este número?”**

## 8. Regra de evidência

O motor nunca deverá criar um valor apenas para desbloquear uma etapa.

Exemplos:

- sem quantidade → duração não calculável;
- sem produtividade → duração não calculável;
- sem calendário → datas não calculáveis com segurança;
- sem predecessoras suficientes → CPM incompleto;
- sem custo unitário → custo não calculável;
- sem evidência de produtividade → não promover a produtividade para uma regra global.

## 9. Ordem de implementação

A implementação será feita incrementalmente:

1. núcleo de cálculo e contrato de resultado;
2. unidades e validação dimensional;
3. quantidade × produtividade → duração;
4. calendários;
5. datas de atividades;
6. relações e lags;
7. CPM;
8. caminho crítico e folgas;
9. recursos;
10. custos;
11. físico-financeiro;
12. valor agregado;
13. cenários;
14. aprendizado/regressão.

## 10. QA + Aurora

### ARQUIMEDES-QA

Criar fixtures determinísticas para:

- cálculo simples de duração;
- unidade incompatível;
- produtividade ausente;
- quantidade ausente;
- calendário;
- FS/SS/FF/SF;
- lag;
- ciclo;
- CPM;
- float;
- caminho crítico;
- recursos;
- custos.

### Aurora Teste

A evolução real deverá seguir:

**53 atividades**
→ preencher dados de duração somente quando houver evidência
→ calcular calendário
→ propor dependências
→ calcular CPM
→ gerar Gantt
→ validar resultados
→ registrar decisão do engenheiro.

Nenhuma etapa deve ser pulada apenas para “fazer o cronograma funcionar”.

## 11. Critério de conclusão

O motor só será considerado validado quando:

- cálculos determinísticos passarem no QA;
- erros conhecidos tiverem regressão;
- Aurora reproduzir os cálculos esperados;
- resultados forem auditáveis;
- nenhum valor tiver sido inventado;
- documentação e implementação estiverem alinhadas;
- o fluxo GitHub → Render → LIVE → teste → validação tiver sido observado.

## 12. Decisão arquitetural

**Decisão:** o Arquimedes terá um motor determinístico de cálculo próprio, inspirado nos padrões observados em Primavera P6, Procore e Autodesk Forma, mas sem reproduzir suas implementações proprietárias.

**Princípio:** LLM decide o que precisa ser analisado; motor determinístico decide apenas o resultado matemático conforme entradas válidas; validação decide se o resultado é confiável; aprovação humana decide se uma proposta pode alterar a obra.
