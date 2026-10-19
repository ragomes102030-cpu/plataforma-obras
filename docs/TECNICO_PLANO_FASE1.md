> **Documento histórico.** Escrito quando a stack era outra: Render, Vercel,
> Aiven e MySQL. Nada disso faz parte do sistema hoje — a stack atual é GitHub +
> DockHosting + Supabase ([STACK-ATUAL.md](STACK-ATUAL.md)). Leia como registro
> da época, não como instrução.

# Plano Técnico — Engenharia Assistida por IA com Rastreabilidade

**Versão:** 1.0 (FASE 1 — Reconhecimento)  
**Data:** 27/09/2026  
**Autor:** Hermes Agent  
**Status:** Proposta para aprovação — espera confirmação do usuário  

---

## 1. Resumo da situação atual (pós-reconhecimento)

### 1.1 O que já existe e funciona

| Componente | Estado | Observação |
|-----------|--------|-------------|
| Backend (Express/tRPC/Drizzle/MySQL) | ✅ Operacional | 9 routers, 21+ tabelas, CPM determinístico, validadores EAP/dependências |
| Frontend (Vite/React 18) | ✅ Operacional | 13 views, Gantt SVG custom, produção, medição |
| MCPs (EAP, Cronograma, Gantt/LOB) | ⚠️ Operacionais mas não testados em produção | HTTP 502 registrado em 20/09; fallback local implementado (Fase 2) |
| Agente (Fases 0-3) | ✅ Implementado |Execução assíncrona, leitura local, validadores determinísticos, CPM, contratos de leitura |
| Fallback local (Fase 2) | ✅ Implementado | Banco local como fonte primária, MCPs como fallback |
| SEINFRA | ✅ Integrado | Catálogo de preços, adapter no backend |

### 1.2 O que falta para atingir o objetivo

**Objetivo:** Plataforma onde cada resultado técnico é rastreável até sua fonte, com regras explícitas e validação determinística.

| Lacuna | Severidade | Fase de resolução |
|--------|------------|-------------------|
| LOB: fórmula não confirmada (DÚVIDA-001) | Crítico | FASE 2 (investigar e validar) |
| Quantitativos sem método de cálculo | Alto | FASE 2 (modelo + regra) |
| Produtividade sem metadados (unidade, origem, equipe) | Alto | FASE 2 (modelo + regra) |
| Avanço financeiro, desvios, KPIs não implementados | Alto | FASE 3-4 (backend + regras) |
| Orçamento sem composição formal validada | Alto | FASE 3 (regra + validação) |
| Engineering Brain (conhecimento rastreável) | Alto | FASE 2-3 (documentação + Open Notebook) |
| Engineering Rules (regras formais) | Alto | FASE 2 (documentação de regras) |
| Engineering Skills (como o agente usa) | Alto | FASE 3 (skills do Hermes) |
| LOB sem persistência no backend | Alto | FASE 3 (persistência) |
| Validação cruzada EAP↔Cronograma | Médio | FASE 3 (validação) |
| Curva S não confirmada em tempo real (DÚVIDA-002) | Médio | FASE 2 (investigar) |
| Decisões/premissas sem formato auditável | Médio | FASE 3 (formato + skill) |
| Fontes técnicas não ingestadas | Médio | FASE 2-3 (ingestão, se legais) |
| SINAPI sem base de preços local | Médio | FASE 2 (investigar disponibilidade) |
| Catálogo de caso de teste de engenharia | Médio | FASE 2 (documentação) |

---

## 2. Decisão sobre o Engineering Brain

### 2.1 Opção A: Open Notebook como backend de busca + `/docs/` como regras formais

**Arquitetura:**
- `/docs/rules/<domínio>-NNN.md` — regras formais, versionadas, testadas
- `/docs/sources/` — fontes originais (PDF, markdown)
- `/docs/decisions/` — decisões e premissas (já existe `DECISIONS.md`)
- `/docs/tests/` — casos de teste de engenharia conhecidos
- Open Notebook — ingestão das fontes, busca (text + vector), síntese (Ask) sobre os documentos

**Vantagens:**
- Regras críticas versionadas e auditáveis no Git
- Open Notebook fornece busca e síntese sobre fontes volumosas
- Sem dependência de servidor adicional para o conhecimento crítico
- Fácil de auditar mudanças nas regras

**Desvantagens:**
- Duas camadas de conhecimento (docs + Open Notebook) podem divergir
- Open Notebook precisa ser instalado/configurado separadamente
- Sem validação automática de regras no Open Notebook

### 2.2 Opção B: Open Notebook como camada única de conhecimento

**Arquitetura:**
- Tudo no Open Notebook: fontes, notas de regra, decisões, casos de teste
- O agente consulta o Open Notebook via API para tudo

**Vantagens:**
- Uma única fonte de verdade
- Busca, síntese e organização nativas

**Desvantagens:**
- Conhecimento crítico depende de ferramenta externa
- Difícil auditar mudanças no tempo (diff do Git não disponível)
- Autenticação e segurança do Open Notebook precisam ser resolvidas
- Frontend diferente (Next.js) — se quiser integrar, há conflito de stacks

### 2.3 Recomendação: Opção A (híbrida)

**Decisão proposta:** Regras técnicas críticas vivem em `/docs/rules/` versionadas no Git. Fontes volumosas (PDF de livros, normas) são ingestadas no Open Notebook para busca e síntese. O agente consulta primeiro as regras formais, depois usa o Open Notebook para aprofundar em fontes.

**Justificativa:**
- Regra = conhecimento rígido, deve ser versionada e testada
- Fonte = conhecimento volumoso, beneficia de busca indexada
- A LLM pode cometer erros ao citar livros; as regras formais servem como verdadeground

---

## 3. Plano de implementação (FASES 2-7, ajustadas após reconhecimento)

### FASE 2 — Projetar e documentar o Engineering Brain e as Regras

**Objetivo:** Ter o conhecimento técnico documentado, estruturado e pronto para ser usado pelo agente.

**Entregáveis:**

1. **`/docs/rules/` — Engineering Rules:**
   - `eap-001.md` a `eap-008.md` (regra dos 100%, elemento único, decomposição, quantidade em folha, sobreposição, lacunas, EAP ≠ cronograma, EAP ≠ orçamento)
   - `cpm-001.md` a `cpm-007.md` (ES/EF/LS/LF, caminho crítico, ciclo, 4 tipos de dependência, calendário, duração derivada, CCPM fora de escopo)
   - `lob-001.md` a `lob-008.md` (início/fim por unidade, fórmula exata, risco de interferência, balanceamento, dimensionamento, persistência, conflitos)
   - `orc-001.md` a `orc-006.md` (composição, BDI, validação por peso, distinção conceitual, seed data, SEINFRA)
   - `ctrl-001.md` a `ctrl-010.md` (avanço físico, avanço financeiro, curva S, desvio de prazo, desvio de custo, CPI, SPI, EAC, VAC, CV, SV)
   - `prod-001.md` a `prod-006.md` (duração = qtd/prod, unidade, origem, equipe, condição, PERT)
   - `qnt-001.md` a `qnt-004.md` (unidade, fórmula + premissa + origem, perdas, arredondamento)
   - `med-001.md` a `med-003.md` (agregação por período, lançamento fiscal, revisão)
   - `gov-001.md` a `gov-005.md` (estados de marco, gates, decisões, premissas, versão do plano)
   - `seg-001.md` a `seg-006.md` (fallback, validação EAP, sem cruzar projetos, cálculo determinístico, idempotência, migração)

2. **`/docs/sources/` — Fontes ingestadas (se legalmente disponíveis):**
   - PDF dos livros disponíveis (Mattos, Darci Prado, TCPO, Limmer, PMI)
   - Notas de capítulo relevantes

3. **`/docs/tests/` — Casos de teste de engenharia conhecidos:**
   - `cpm-known-results.md` — redes com resultado esperado
   - `eap-validation-cases.md` — EAP válida e inválida
   - `lob-known-results.md` — LOB com resultado esperado (Mattos Cap.20)
   - `composition-validation-cases.md` — composição com resultado esperado

4. **Integração com Open Notebook (se aprovado):**
   - Criar notebook "Plataforma Obras"
   - Ingestar fontes de `/docs/sources/` e PDFs disponíveis
   - Criar notas de regra a partir de `/docs/rules/`
   - Testar busca e síntese

**Saída:** O agente pode consultar `/docs/rules/` para encontrar a regra aplicável a qualquer domínio.

---

### FASE 3 — Implementar validações e persistência que faltam

**Objetivo:** Preencher as lacunas de implementação identificadas na matriz de cobertura.

**Entregáveis:**

1. **Validação de quantitativos (QNT-001, QNT-002):**
   - Campo `metodo_calculo` nos quantitativos
   - Campo `premissas` (JSON)
   - Campo `origem` (enum: informado, calculado, extraído, estimativa, hipótese, lacuna)
   - Validação de unidade e dimensão

2. **Metadados de produtividade (PROD-002 a PROD-005):**
   - Campo `unidade` obrigatório em recursos/produtividade
   - Campo `origem` (SINAPI, SEINFRA, experiência, livro, estimativa)
   - Campo `condicao_aplicacao`
   - Campo `referencia_bibliografica`

3. **Persistência de LOB no backend (LOB-007):**
   - Tabela `lob_units` (projectId, versionId, atividadeId, unidade, inicio, fim, risco_interferencia, espera_dias)
   - Vincular ao projeto e à versão do plano
   - Persistir após geração via MCP Gantt/LOB

4. **Validação cruzada EAP↔Cronograma (EAP-008 + integração):**
   - Validar que atividades referenciam nós de EAP existentes
   - Bloquear gravação de atividade com eap_ref inválido

5. **Curva S em tempo real (CTRL-004):**
   - Verificar se re-query após confirmação de produção
   - Se não: implementar re-query

6. **Validação de orçamento (ORC-001, ORC-003):**
   - Validar que custo total = soma das composições
   - Validação de custo por peso (alerta, não bloqueio)

7. **Avanço financeiro e KPIs (CTRL-002, CTRL-007, CTRL-008, KPI-001 a KPI-006):**
   - Calcular EV a partir de produção confirmada
   - Implementar CPI, SPI, EAC, VAC, CV, SV
   - Tela de controle com indicadores

8. **Formato de premissas e decisões (GOV-004):**
   - Formato JSON para premissas, fatos, hipóteses, lacunas
   - Registrar em `agent_decisions` ou tabela dedicada

---

### FASE 4 — Skills do agente e governança

**Objetivo:** Ensinar o agente a usar o Engineering Brain e a obedecer às regras.

**Entregáveis:**

1. **Skills do Hermes (criar ou atualizar):**
   - `engenharia-eap` — quando consultar, regras aplicáveis, MCPs, validação
   - `engenharia-cpm` — quando consultar, regras, cálculo determinístico, validação
   - `engenharia-lob` — quando consultar, regra da LOB, MCP Gantt/LOB, validação
   - `engenharia-orcamento` — quando consultar, composição, preços, validação
   - `engenharia-controle` — quando consultar, indicadores, curva S, avanços
   - `engenharia-quantitativos` — quando consultar, método, premissas, origem
   - `engenharia-produtividade` — quando consultar, unidade, origem, equipe
   - `engenharia-validacao` — auditoria geral, regra dos 100%, coerência

2. **Governança de marco (GOV-001, GOV-002):**
   - Implementar estados de marco (se não implementado na Fase 4 original)
   - Implementar gates obrigatórios
   - Bloquear agente quando gate não satisfeito

3. **Registro de rastreabilidade:**
   - Cada decisão do agente registra: domínio, regra aplicada, fonte, fórmula, dados de entrada, premissas, MCP executado, validação, resultado

---

### FASE 5 — Validar a LOB (Item Crítico)

**Objetivo:** Resolver a DÚVIDA-001 e garantir que o LOB está correto.

**Passos:**

1. Ler o código do `mcp-gantt-lob-server/models/lob.py`
2. Ler o Cap.20 do livro "Planejamento e Controle de Obras" de Aldo Dórea Mattos (se disponível legalmente)
3. Comparar implementação com livro
4. Criar caso de teste com resultado conhecido
   - Ex: 2 atividades (A: parede, B: reboco), 3 unidades repetitivas, ritmos conhecidos
   - Resultado esperado: início/fim de cada atividade em cada unidade, risco de interferência
5. Validar ou corrigir a implementação
6. Atualizar LOB-002 com fórmula formal confirmada

---

### FASE 6 — Testar e homologar

**Objetivo:** Validar que o sistema novo funciona como esperado.

**Entregáveis:**

1. **Testes de engenharia:**
   - CPM: validar contra casos conhecidos (já existe na Fase 3)
   - LOB: validar contra caso do Mattos Cap.20
   - Validação de EAP: validar contra EAP válida/inválida
   - Composição: validar contra caso conhecido

2. **Testes de integração:**
   - Agente consulta regra → aplica → valida → registra rastreabilidade
   - Fallback local funciona quando MCP indisponível
   - LOB persistido no backend após geração via MCP

3. **Modo sombra (FASE 8 do plano original):**
   - Comparar agente antigo vs agente com Engineering Brain
   - Validar que o novo agente não piora resultados

---

### FASE 7 — Ativação gradual

**Objetivo:** Colocar o sistema em produção de forma segura.

**Passos:**
1. Ativar para usuário administrador primeiro
2. Ativar para obras de homologação
3. Monitorar divergências
4. Corrigir problemas encontrados
5. Expandir para todos os usuários

---

## 4. Ordem de execução recomendada

```
FASE 2 — Documentar Engineering Brain e Regras
    ↓ (conhecimento pronto para usar)
FASE 3 — Implementar validações e persistência
    ↓ (regra + implementação)
FASE 5 — Validar a LOB (item crítico, pode ser em paralelo)
    ↓ (item crítico resolvido)
FASE 4 — Skills e governança
    ↓ (agente capaz de usar)
FASE 6 — Testar e homologar
    ↓ (validado)
FASE 7 — Ativação gradual
```

**Nota:** A FASE 5 (validar LOB) é o item crítico. Se não for resolvida primeiro ou em paralelo, todo o resto construído sobre LOB estará em dúvida.

---

## 5. O que NÃO faremos

- Não criar novas funcionalidades sem justificativa técnica
- Não refatorar o sistema sem necessidade comprovada
- Não criar novos MCPs sem necessidade
- Não mover lógica de validação para MCPs sem justificativa
- Não usar IA para compensar fundamentos de engenharia ausentes
- Não substituir cálculos determinísticos por LLM
- Não criar RAG apenas para existir

---

## 6. Como medir sucesso

O sistema está pronto quando é possível responder a estas perguntas para qualquer resultado técnico:

1. **Qual regra foi aplicada?** → Regra ID no registro de rastreabilidade
2. **Qual é a fonte?** → Fonte bibliográfica ou interna na regra
3. **Qual fórmula foi utilizada?** → Fórmula na regra, com premissas
4. **Quais dados entraram?** → Lista de dados de entrada no registro
5. **Quais premissas foram adotadas?** → Declaração explícita de premissas
6. **Qual MCP executou?** → Nome do MCP no registro
7. **Qual teste validou?** → ID do teste ou validação manual documentada
8. **O resultado foi calculado ou estimado?** → Campo `origem` no quantitativo
9. **Existe alguma lacuna?** → Declaração de lacunas no registro

---

## 7. Riscos do plano

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| LOB incorreta e não detectada | Média | Alto | FASE 5 dedicada, comparar com livro, teste com caso conhecido |
| Engenharia Brain não usado pelo agente | Média | Médio | Skills obrigatórias, gates que exigem consulta |
| Open Notebook introduzindo complexidade | Baixa | Médio | Only usar se aprovado; fallback para /docs/ only |
| MCPs continuarem instáveis | Alta | Alto | Fallback local como caminho primário (Fase 2 já implementada) |
| Fontes técnicas não disponíveis legalmente | Alta | Médio | Registrar como "conhecimento da LLM, sem citação" |

---

## 8. Próximas ações imediatas (antes de aprovação)

1. ✅ Mapear arquitetura existente (FEITO — este documento)
2. ✅ Mapear MCPs existentes (FEITO)
3. ✅ Mapear Open Notebook (FEITO)
4. ✅ Identificar lacunas (FEITO — TECHNICAL_GAPS.md)
5. ✅ Criar matriz de cobertura (FEITO — ENGINEERING_COVERAGE_MATRIX.md)
6. ⏳ Apresentar este plano ao usuário para aprovação
7. ⏳ Iniciar FASE 2 após aprovação

---

**Este documento e os dois documentos complementares (`ENGINEERING_BRAIN_ARCHITECTURE.md` e `ENGINEERING_COVERAGE_MATRIX.md` e `TECHNICAL_GAPS.md`) formam o entregável completo da FASE 1.**

**Aguardo aprovação do usuário antes de iniciar a FASE 2.**
