# KNOWN_ISSUES.md — Problemas Conhecidos

## BUGS

### BUG-001: Testes de GitHub OAuth com URL desatualizada
**Severidade:** Baixa  
**Descrição:** O teste `server/_core/github-oauth.test.ts` ainda usa `.onrender.com` no `redirect_uri`, mas o sistema migrou para `.vercel.app`.  
**Evidência:** Falha no teste de OAuth — `expected 'https://plataforma-obras-8uhqy3k5f-ra…' to be 'https://plataforma-obras-api.onrender…'`  
**Status:** NÃO CORRIGIDO (não afeta funcionalidade do sistema)

---

## LIMITAÇÕES

### LIMIT-001: Gantt com SVG custom, não DHTMLX
**Severidade:** Média  
**Descrição:** O Gantt usa renderização SVG custom em vez de biblioteca DHTMLX Gantt.  
**Impacto:** Pode ter performance inferior com muitas atividades (1000+).  
**Status:** CONSCIENTE (decisão de implementação)

---

### LIMIT-002: Sem nívelamento de recursos automático
**Severidade:** Média  
**Descrição:** O sistema não faz alocação/leveling automático de recursos. Se duas atividades usam a mesma equipe no mesmo período, o usuário deve resolver manualmente.  
**Impacto:** Conflitos de recursos não são detectados automaticamente.  
**Status:** CONSCIENTE (escopo limitado)

---

### LIMIT-003: Sem cálculo automático de duração
**Severidade:** Baixa  
**Descrição:** A duração da atividade não é calculada automaticamente a partir de quantidade ÷ produtividade. O usuário deve informar ou clicar em "Calcular CPM" para atualizar.  
**Impacto:** O usuário precisa calcular a duração manualmente ou executar o CPM.  
**Status:** CONSCIENTE (pode ser melhorado)

---

### LIMIT-004: Sem cálculo automático de BDI e encargos
**Severidade:** Baixa  
**Descrição:** O sistema não calcula automaticamente BDI, PIS, COFINS, impostos, lucro — o usuário deve informar os valores.  
**Impacto:** O orçamento é incompleto para obras reais sem entrada manual.  
**Status:** CONSCIENTE (escopo atual)

---

### LIMIT-005: Sem validação de custos em peso
**Descrição:** O sistema não valida se o custo total by peso (m², m³, vb) está dentro de faixas de mercado.  
**Impacto:** O usuário pode inserir custos irreaissem ser alertado.  
**Status:** CONSCIENTE (não implementado)

---

## DÍVIDAS TÉCNICAS

### DÚVIDA-001: Fórmula exata da Linha de Balanço
**Descrição:** Não foi possível confirmar 100% a fórmula da LOB sem ler o código do `planning.lob` com mais detalhes.  
**Evidência:** Procedimento existe, lógica presumida baseada em variável `rhythm`, `delay`, `adjustedEnd`  
**Status:** NÃO RESOLVIDA (precisa de verificação no código)

---

### DÚVIDA-002: Reação da Curva S a novos lançamentos
**Descrição:** Não foi possível confirmar se a Curva S é reconstruída em tempo real quando um novo lançamento é confirmado.  
**Evidência:** A query `scurve` é feita quando a página é carregada. Se o frontend não faz re-query após confirmar produção, a curva não atualiza sem reload.  
**Status:** NÃO RESOLVIDA (precisa de verificação no frontend)

---

### DÚVIDA-003: Nível de integração entre frentes e equipes
**Descrição:** Não ficou claro se equipes podem estar em múltiplas frentes simultaneamente e como o controle lida com isso.  
**Evidência:** A tabela `production_entries` tem `frontId` e `teamId` independentes.  
**Status:** NÃO RESOLVIDA (precisa de verificação no código)

---

## UX — EXPERIÊNCIA DO USUÁRIO

### UX-001: Navegação não óbvia para usuário novo
**Descrição:** O menu tem 13 itens. Sem guia, um usuário novo pode não entender a sequência lógica: Obra → EAP → Orçamento → Cronograma → Produção → Controle.  
**Evidência:** Home.tsx tem 1531 linhas com 14 módulos visíveis.  
**Status:** CONHECIDO (precisa de onboarding)

---

### UX-002: Volume de informações no dashboard
**Descrição:** O dashboard mostra muitos módulos. Pode ser abrumador para usuário novo.  
**Status:** CONHECIDO

---

## PERFORMANCE

### PERF-001: Gantt com muitas atividades
**Descrição:** Com 1000+ atividades, a renderização SVG pode ficar lenta.  
**Evidência:** Gantt usa SVG custom, sem virtualização conhecida.  
**Status:** NÃO MEDIDO (sem teste de carga)

---

## VALIDAÇÃO PENDENTE

### PEND-001: Persistência após reconexão
**Descrição:** Não foi possível verificar se os dados são persistentes após fechar e reabrir o navegador.  
**Status:** NÃO VALIDADO

---

### PEND-002: Cascata de alterações
**Descrição:** Não foi possível testar se alterar quantidade de um serviço atualiza automaticamente: CPM, Gantt, LOB, controle, curva S, orçamento.  
**Status:** NÃO VALIDADO

---

### PEND-003: Integração com MCPs externos
**Descrição:** Os MCP servers (cronograma, EAP, Gantt/LOB) não foram testados em ambiente real.  
**Status:** NÃO VALIDADO

---

Versão: 1.0
Data: 2026-09
