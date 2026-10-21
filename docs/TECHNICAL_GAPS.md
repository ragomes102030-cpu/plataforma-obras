> **Documento histórico.** Escrito quando a stack era outra: Render, Vercel,
> Aiven e MySQL. Nada disso faz parte do sistema hoje — a stack atual é GitHub +
> Render + Supabase ([STACK-ATUAL.md](STACK-ATUAL.md)). Leia como registro
> da época, não como instrução.

# Technical Gaps — Lacunas Técnicas Identificadas

**Versão:** 1.0 (FASE 1 — Reconhecimento)  
**Data:** 27/09/2026  
**Autor:** Hermes Agent  
**Status:** Proposta para aprovação  

---

## 1. Metodologia

Esta análise mapeou o sistema em quatro camadas:

1. **Código existente:** backend (Express/tRPC/Drizzle/MySQL), frontend (Vite/React), MCPs (EAP, Cronograma, Gantt/LOB), agente (Fases 0-3)
2. **Documentação existente:** `ARCHITECTURE.md`, `BUSINESS_RULES.md`, `DECISIONS.md`, `KNOWN_ISSUES.md`, `PLANO-EVOLUCAO-CEREBRO-DE-OBRAS.md`, `AI_CONTEXT.md`
3. **MCPs externos:** leitura dos READMEs e CLAUDE.md dos três servidores MCP
4. **Open Notebook:** leitura da arquitetura e API (arquivo `architecture.md`, routers de api/notes, api/sources, api/search, api/notebooks)

As lacunas são classificadas em:

- **Lacuna conhecida:** já documentada no `KNOWN_ISSUES.md`
- **Lacuna nova:** descoberta nesta análise, não estava documentada
- **Lacuna de integração:** existe em uma camada mas não conecta com outra

---

## 2. Lacunas críticas (risco alto de falsa precisão ou imprecisão)

### 2.1 Quantitativos sem método de cálculo registrado (LACUNA NOVA — Alto)

**Problema:** O sistema não registra o método de cálculo dos quantitativos. Quando um quantitativo é informado (ex: "120 m² de alvenaria"), não há campo para declarar fórmula, premissas e origem. O número existe, mas sua derivação é opaca.

**Impacto:** Qualquer quantitativo pode ser inventado pela LLM ou informado sem base. Não há como auditar "de onde esse número veio".

**Caminho de resolução:**
1. Criar campo `metodo_calculo` nos quantitativos (texto livre + referência)
2. Criar campo `premissas` (JSON ou texto)
3. Criar campo `origem` (informado / calculado / extraído / estimativa / lacuna)
4. Integrar com Engineering Rules (QNT-002)

---

### 2.2 Produtividade sem metadados (LACUNA NOVA — Alto)

**Problema:** Quando uma produtividade é usada para calcular duração, não há registro de:
- Unidade (h/m², m²/h, m³/dia, vb/dia, etc.)
- Origem (SINAPI? SEINFRA? experiência? livro?)
- Condição de aplicação (com qual equipe? com qual equipamento?)
- referência bibliográfica

**Impacto:** A regra PROD-001 (duração = quantidade ÷ produtividade) é implementada, mas a produtividade em si é um número flutuante sem contexto. Dois projetos diferentes podem usar o mesmo número com significados diferentes.

**Caminho de resolução:**
1. Criar campos em `planning_resources` ou tabela associada: `unidade`, `origem`, `condicao_aplicacao`, `referencia`
2. Integrar com Engineering Rules (PROD-002 a PROD-005)
3. Criar skill de produtividade que oriente o agente a declarar esses campos

---

### 2.3 Fórmula exata de Linha de Balanço não confirmada (LACUNA CONHECIDA — Crítico)

**Problema:** `KNOWN_ISSUES.md` registra DÚVIDA-001: "Não foi possível confirmar 100% a fórmula da LOB sem ler o código do `planning.lob` com mais detalhes." A lógica é presumida com base em variáveis `rhythm`, `delay`, `adjustedEnd`.

**Impacto:** O LOB é um método matemático específico (Mattos Cap.20). Se a implementação não bater exatamente com o livro, os resultados de início/fim e risco de interferência podem ser incorretos.

**Caminho de resolução:**
1. Ler o código do mcp-gantt-lob-server (`models/lob.py`) e comparar com Mattos Cap.20
2. Formalizar a fórmula em ENGINEERING_RULE (LOB-002)
3. Criar caso de teste com resultado conhecido (ex: 3 unidades, 2 atividades, ritmos conhecidos)
4. Validar ou corrigir a implementação

---

### 2.4 Curva S não confirmada em tempo real (LACUNA CONHECIDA — Médio)

**Problema:** `KNOWN_ISSUES.md` registra DÚVIDA-002: "Não foi possível confirmar se a Curva S é reconstruída em tempo real quando um novo lançamento é confirmado."

**Impacto:** Se o frontend não faz re-query após confirmar produção, a curva S fica desatualizada até refresh da página.

**Caminho de resolução:**
1. Verificar o código do frontend (MedicaoView.tsx / GanttView.tsx) e backend (planning.scurve)
2. Se não atualiza: implementar re-query após confirmação
3. Documentar o comportamento no ENGINEERING_RULE (CTRL-004)

---

### 2.5 Avanço financeiro e desvios não implementados (LACUNA NOVA — Alto)

**Problema:** O sistema calcula avanço físico (CTRL-001), mas não avanço financeiro, não desvio de prazo, não desvio de custo. Sem instruções de como calcular EV (Earned Value) a partir dos lançamentos de produção.

**Impacto:** O controle está incompleto. Sem CPI, SPI, EAC, VAC. O usuário não tem visibilidade de desempenho financeiro do projeto.

**Caminho de resolução:**
1. Definir como EV é calculado a partir de produção confirmada (quanto vale cada lançamento?)
2. Implementar CTRL-002 (avanço financeiro)
3. Implementar CTRL-007 (desvio de prazo)
4. Implementar CTRL-008 (desvio de custo)
5. Implementar KPIs PMI (KPI-001 a KPI-006)
6. Integrar com Engineering Rules (CTRL-*, KPI-*)
7. Criar skill de controle que oriente o agente

---

### 2.6 Orçamento sem composição técnica formal (LACUNA NOVA — Alto)

**Problema:** O sistema tem `service_compositions` e `composition_components` no banco (DECISÃO arquitetural), mas:
- Não há validação de que o custo total = soma das composições
- Não há distinção formal entre preço, custo, coeficiente, consumo, produtividade
- BDI e encargos são informados manualmente (LIMIT-004)
- Não há validação de custo por peso (LIMIT-005)

**Impacto:** Um orçamento pode ter números que não batem entre si, e ninguém (nem LLM, nem sistema) detecta. O usuário vê um número final, mas não sabe se ele é tecnicamente coerente.

**Caminho de resolução:**
1. Implementar validação de coerência de orçamento (ORC-001)
2. Criar ENGINEERING_RULE para composição de preços (TCPO, SEINFRA)
3. Implementar cálculo automático de BDI/encargos (ORC-002) ou deixar como campo manual com aviso
4. Implementar validação de custo por peso (ORC-003)
5. Criar distinção formal nos tipos (ORC-004)

---

### 2.7 Indicadores PMI/Limmer não implementados (LACUNA NOVA — Alto)

**Problema:** CPI, SPI, EAC, VAC, CV, SV são padrão do setor (PMI PMBOK, Limmer). Não estão implementados.

**Impacto:** O sistema não fala a língua do mercado para controle de projeto.

**Caminho de resolução:** Ver item 2.5.

---

## 3. Lacunas de integração

### 3.1 LOB não está no backend da plataforma (LACUNA DE INTEGRAÇÃO — Alto)

**Problema:** A Linha de Balanço existe apenas no MCP Gantt/LOB (mcp-gantt-lob-server, stateless ou Turso). Não há implementação no backend da plataforma-obras (Express/tRPC). Ou seja: o LOB é gerado pelo MCP, mas não fica persistente no banco da plataforma.

**Impacto:** O LOB é uma saída pontual (arquivo .xlsx), não um dado da plataforma. Não há como cruzar LOB com produção real, com medição, com controle.

**Caminho de resolução:**
1. Persistir resultados do LOB no banco (tabela `lob_units` ou similar)
2. Vincular LOB ao projeto e à versão do plano
3. Integrar com produção confirmada para atualizar LOB dinamicamente
4. Documentar em ENGINEERING_RULE (LOB-007)

---

### 3.2 MCPs não testados em ambiente real (LACUNA CONHECIDA — Alto)

**Problema:** `KNOWN_ISSUES.md` registra PEND-003: "Os MCP servers (cronograma, EAP, Gantt/LOB) não foram testados em ambiente real." O teste real de 20/09/2026 mostrou HTTP 502 nos MCPs EAP e Cronograma.

**Impacto:** O sistema depende dos MCPs para persistência, mas eles falharam em ambiente real. O plano original já prevê fallback local (Fase 2), mas a dependência MCP persiste.

**Caminho de resolução:**
1. Investigar causa do HTTP 502 (Render? Vercel? configuração?)
2. Validar se os MCPs estão operacionais agora
3. Documentar estado atual dos MCPs (operacional / indisponível / degradado)
4. Reforçar o fallback local como caminho primário (já previsto na Fase 2 do plano original)

---

### 3.3 Validação cruzada EAP↔Cronograma não existe (LACUNA NOVA — Médio)

**Problema:** O MCP Cronograma aceita `eap_ref` como string opaca (uid ou eap_id do MCP EAP), mas não valida ao vivo se o nó realmente existe na EAP (TODO em `models/db.py` do MCP Cronograma). Ou seja: uma atividade pode referenciar um eap_id que não existe.

**Impacto:** O banco de cronograma pode ter atividades órfãs em relação à EAP, e o sistema não avisa.

**Caminho de resolução:**
1. Implementar validação ao vivo (chamando `get_eap_node` do MCP EAP via HTTP, com timeout e falha graciosa)
2. Ou: validar no backend da plataforma (que tem ambas as tabelas: wbs_nodes e schedule_activities)
3. Documentar como ENGINEERING_RULE

---

### 3.4 Open Notebook não integrado (LACUNA DE INTEGRATION — Médio)

**Problema:** O Open Notebook existe como ferramenta externa, mas não há integração com a plataforma. Nenhum documento técnico do projeto foi ingestado. Nenhuma regra foi indexada.

**Impacto:** O Engineering Brain proposto não existe na prática. O conhecimento técnico está disperso nos arquivos .md do repo e na cabeça da LLM.

**Caminho de resolução:**
1. Decidir se usa Open Notebook ou apenas `/docs/` versionado (ver ENGINEERING_BRAIN_ARCHITECTURE.md)
2. Se usar Open Notebook: criar notebook "Plataforma Obras", ingestar fontes relevantes, criar notas de regra
3. Se usar apenas `/docs/`: estruturar `/docs/rules/` com os arquivos de regra
4. Criar skill de consulta que oriente o agente a consultar a base antes de decidir

---

### 3.5 Frontend Next.js do Open Notebook vs React 18/Vite da plataforma (LACUNA DE INTEGRAÇÃO — Baixo)

**Problema:** O Open Notebook tem frontend próprio em Next.js 15. A plataforma usa Vite + React 18. Integrar visualmente seria duplicar esforço.

**Impacto:** Baixo — se a decisão for usar o Open Notebook apenas como backend de busca (API), o frontend não importa. Se a decisão for integrar a interface, haveria conflito de stacks.

**Caminho de resolução:** Manter o Open Notebook como backend API. A interface do usuário continua sendo a plataforma-obras. Caso queira uma interface de knowledge base dedicada, analisar em outra fase.

---

## 4. Lacunas de governança

### 4.1 Estados de marco e gates não implementados (LACUNA NOVA — Alto)

**Problema:** O plano original (Fase 4) previa estados de marco (DESCRITIVO → EAP_PROPOSTA → ... → CONTROLE) e gates obrigatórios. A implementação está pendente ou não validada.

**Impacto:** Sem gates, o agente pode pular etapas (ex: gerar cronograma sem EAP aprovada).

**Caminho de resolução:**
1. Implementar Fase 4 (ou verificar se já foi implementada e não documentada)
2. Implementar validação de gates no backend
3. Integrar com o agente para que ele consulte o marco antes de executar

---

### 4.2 Decisões e premissas sem formato auditável (LACUNA NOVA — Médio)

**Problema:** O plano original (Fase 4) previa registrar premissas, fatos, hipóteses e lacunas em formato auditável. Não está implementado.

**Impacto:** Quando o agente usa uma premissa, não há registro formal dela. Outro agente ou usuário não pode rastrear "por que esse número foi usado?".

**Caminho de resolução:**
1. Criar formato de registro (ex: tarefa `agent_decisions` estendida com `premissas` JSON)
2. Criar skill que oriente o agente a registrar premissas antes de usar
3. Integrar com Engineering Rules

---

## 5. Lacunas de conhecimento (fontes)

### 5.1 Fontes técnicas não ingestadas (LACUNA NOVA — Médio)

**Problema:** Os livros e normas mencionados no plano (PMI, Mattos, Darci Prado, TCPO, SINAPI, SEINFRA-CE, Limmer) não estão disponíveis como fontes consultáveis no sistema. A LLM tem conhecimento desses livros em seu treinamento, mas não há como rastrear uma resposta até a página do livro.

**Impacto:** O agente pode responder com base no que "lembra" dos livros, mas sem citação exata. Isso é perigoso para regras que exigem precisão (ex: fórmula de LOB, definição de SPI).

**Caminho de resolução:**
1. Identificar quais fontes têm acesso legal (acervo pessoal, biblioteca, etc.)
2. Ingestar as fontes disponíveis no Engineering Brain (Open Notebook ou `/docs/sources/`)
3. Para fontes não disponíveis: registrar como "conhecimento da LLM, sem citação exata — usar com cautela"
4. Priorizar: Mattos (Cap.20 LOB), PMI (PMBOK, WBS Practice Standard), Limmer (controle)

---

### 5.2 SINAPI/SEINFRA com base de preços inexistente localmente (LACUNA CONHECIDA — Médio)

**Problema:** O sistema integra com SEINFRA para preços (B13), mas a base de preços SINAPI local não está disponível ou não foi validada. O teste de 22/09/2026 marcou estágio como estimativa por falta de base SINAPI.

**Impacto:** Composições de preços podem estar usando preços desatualizados ou inexistentes.

**Caminho de resolução:**
1. Investigar a base SINAPI disponível (arquivo .db, CSV, API?)
2. Se disponível: integrar e validar
3. Se não disponível: registrar como lacuna e usar preços informados com aviso explícito

---

## 6. Lacunas de teste

### 6.1 LOB sem teste de engenharia validado (LACUNA NOVA — Alto)

**Problema:** O LOB tem implementação no MCP Gantt/LOB, mas os testes são do MCP (unitário?), não do sistema integrado. A DÚVIDA-001 diz que a fórmula não foi confirmada 100%.

**Caminho de resolução:** Ver item 2.3.

---

### 6.2 Catálogo de teste de engenharia inexistente (LACUNA NOVA — Médio)

**Problema:** O sistema tem testes de software (unitários, E2E), mas não há catálogo de "casos de engenharia" com resultado esperado conhecido. Ex: "rede com 3 atividades em série: ES=[0,5,10], EF=[5,10,15], crítico=[A,B,C]" — isso existe em código, mas não como documentação de caso de teste de engenharia.

**Caminho de resolução:**
1. Criar `/docs/tests/` com casos de engenharia conhecidos
2. Incluir: EAP válida/inválida, CPM conhecida, LOB conhecida, composição conhecida
3. Usar como base para validação do Engineering Brain

---

## 7. Resumo das lacunas por severidade

| Severidade | Quantidade | Exemplos |
|------------|------------|----------|
| **Crítico** | 1 | LOB-002: fórmula não confirmada |
| **Alto** | 7 | Quantitativos sem método, produtividade sem metadados, avanço financeiro/desvios não implementados, orçamento sem composição formal, LOB sem persistência no backend, KPIs não implementados, MCPs não testados em ambiente real |
| **Médio** | 6 | Curva S em tempo real, validação cruzada EAP↔Cronograma, decisões/premissas sem formato auditável, fontes não ingestadas, SINAPI sem base local, catálogo de teste de engenharia inexistente |
| **Baixo** | 3 | Gantt SVG performance, frontend Next.js vs Vite, independência de embedding model |

---

## 8. Lacunas que não são lacunas (para não gastar energia resolvendo o que já funciona)

- **CPM:** implementado, testado, validado (Fase 3)
- **Validação de EAP básica:** implementada, testada
- **Validação de dependências:** implementada, testada
- **Detecção de ciclo:** implementada, testada
- **Avanço físico:** implementado, testado
- **Curva S:** implementada, testada (com ressalva DÚVIDA-002)
- **Baseline:** implementada, testada
- **Segurança de dados (Fase 0/1):** implementada, testada
- **Fallback local (Fase 2):** implementada, testada

---

**Próximo passo:** Apresentar este documento ao usuário para aprovação antes de iniciar a FASE 2.
