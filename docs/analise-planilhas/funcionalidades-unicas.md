# Funcionalidades Exclusivas por Planilha

> Recursos que existem em **apenas uma** das 3 referências — candidatos a backlog do produto (ou descarte consciente).

---

## 1. Exclusivos de P1 (ARES — 19 abas)

| # | Funcionalidade | Aba | Valor p/ produto | Sugestão |
|---|----------------|-----|------------------|----------|
| P1-U1 | **Linha de Balanço completa** (944 fórmulas, grade tempo×serviço, KPIs) | LINHA DE BALANÇO | Alto — módulo LOB core | Já no produto (alavancar P1 como spec) |
| P1-U2 | **Rede de precedências** 17 elos FS + lag + origem de regra | REDE | Alto p/ CPM | Import se CPM em escopo |
| P1-U3 | **Caminho crítico** (stub “aguarda modelagem”) | CAMINHO CRÍTICO | Alto (roadmap) | Feature futura — P1 não tem spec |
| P1-U4 | **BDI composto TCU** (componentes + fórmula) | CONFIGURAÇÕES | Alto p/ orçamento | Implementar quando % com fonte (C10) |
| P1-U5 | **Composição de custo** (recurso×coeficiente → custo unit) | ORÇAMENTO | Alto | Portar com orçamento |
| P1-U6 | **Hárvore de locais** LOCAL-T-P-AP (~245) | CADASTRO | Alto p/ rastreio por unidade | Portar árvore |
| P1-U7 | **Catálogo de 10 fórmulas canônicas** documentadas | FÓRMULAS | Médio — regra de negócio | Virar tests/docs do produto |
| P1-U8 | **10 listas de domínio controlado** | CONFIGURAÇÕES | Alto — enums | Portar como config/enums |
| P1-U9 | **Indicadores com narrativa** (STATUS + leitura) | INDICADORES | Médio (após C7) | Portar após revalidar |
| P1-U10 | **5 gráficos** (planejado×real, produção acumulada) | GRÁFICOS | Médio | Relatórios |
| P1-U11 | **Regra anti-conflito de domínio** (ORÇADO≠CONTRATADO≠…, QTDs) | SERVIÇOS/ORÇ/MED | Alto — integridade | Validations no sistema |
| P1-U12 | **Triângulo SERVIÇO = EAP×FRENTE×LOCAL** + sinalização de duplicata | SERVIÇOS | Alto | Schema + warnings |
| P1-U13 | **Classificação “o que não é frente”** | FRENTES | Baixo — documentação | Docs de domínio |
| P1-U14 | **Equipes transitórias** com regra de migração para RECURSOS | FRENTES | Médio — modelagem | Decisão: entidade permanente? |
| P1-U15 | **Necessidade Serviço×Recurso** | RECURSOS | Médio | Alavanca LOB/produção |
| P1-U16 | **MEDIÇÃO por serviço** (qtd contratada/executada/medida, %MED) | MEDIÇÃO | Alto | Modelo híbrido (C2) |
| P1-U17 | **Stub CONTROLE** | CONTROLE | Incerto | Backlog / definir escopo |
| P1-U18 | **Dashboard executivo rico** (KPIs + 11 serviços + curva) | DASHBOARD | Alto | Relatórios |
| P1-U19 | **Duração/status por fórmula central** (col Q, types manuais) | PLANEJAMENTO | Alto | Status engine |

---

## 2. Exclusivos de P2 (Template de Relatório)

| # | Funcionalidade | Aba | Valor p/ produto | Sugestão |
|---|----------------|-----|------------------|----------|
| P2-U1 | **Gantt diário** 8 semanas roláveis + destaque “hoje” `#AD3815` | Cronograma em Gantt | **Alto — UX** | Referência p/ modo dia do Gantt |
| P2-U2 | **EAP física de ciclo de vida**: viabilidade→projeto→legal→…→entrega | EAP Física | Alto **se** pré-obra em escopo | Decisão U2 |
| P2-U3 | **EAP orçamentária 4 dígitos** (1001, 2001, 3001…) | EAP Orçamento | Médio — classificação de custos | `CategoriaOrcamento` |
| P2-U4 | **Progresso por responsável** (ATRIBUÍDO PARA + %) | Gantt | Médio | Pessoa em tarefa |
| P2-U5 | **Instruções de acessibilidade / leitor de tela** | col A Gantt | Médio — a11y | UX de relatório |
| P2-U6 | **Janela de 8 semanas** com navegação temporal | Gantt | Alto — UX | Config de viewport |
| P2-U7 | **Template de relatório semanal** pronto para cliente | tudo | Alto — relatórios | Export/share |
| P2-U8 | **Aba Sobre protegida** (SHA-512) | Sobre | **Baixo / nenhum** | Não portar proteção |
| P2-U9 | **Fases com barras agrupadas** (grupo → tarefas) | Gantt | Médio | Hierarquia visual |

**Não portar**: proteção SHA-512, `#REF!`, ranges fixos de template, progresso manual sem auditoria.

---

## 3. Exclusivos de P3 (Relatório Profissional)

| # | Funcionalidade | Aba | Valor p/ produto | Sugestão |
|---|----------------|-----|------------------|----------|
| P3-U1 | **Medições globais numeradas** MED-01… com Parcela/Saldo/%Acum | MEDICOES | **Alto — padrão BR** | Gap forte no sistema (matriz) |
| P3-U2 | **Código hierárquico de atividade** `01.01` | CRONOGRAMA | Médio | `codigo_exibicao` |
| P3-U3 | **Produtividade = Qtd/Duração** explícita | CRONOGRAMA | Médio | Campo derivado |
| P3-U4 | **Duração = Fim−Inicio+1** documentada no cabeçalho | CRONOGRAMA | Médio | regra idem |
| P3-U5 | **Dashboard contagem por status** (% do total, 4 status) | DASHBOARD | Alto | KPI/BI |
| P3-U6 | **Fluxo PRODUCAO → CRONOGRAMA via SUMIF** (fonte única de %Real) | PRODUCAO | Alto | pipeline produção→% |
| P3-U7 | **Enxutz / leveza** (6 abas, 16 KB, 117 fórmulas) | — | Médio — arquitetura relatório | modelo de “relatório mensal” |
| P3-U8 | **Coluna Pavimento textual** (SB, PL, P01…) sem árvore | CRONOGRAMA | Baixo se tiver Local | opcional |
| P3-U9 | **Status Em análise** na medição | MEDICOES | Médio | enum medição |
| P3-U10 | **Resumo identificação** (endereço, responsável, data-base) | RESUMO | Médio | capa de relatório |

---

## 4. Matriz “quem tem o quê” (exclusivos)

| Capacidade exclusiva | P1 | P2 | P3 |
|----------------------|----|----|-----|
| LOB | ✅ | | |
| Precedências / CPM | ✅ (stub CP) | | |
| BDI + composições | ✅ | | |
| Árvore LOCAL | ✅ | | |
| Fórmulas canônicas doc. | ✅ | | |
| Domínios controlados | ✅ | | |
| Métrica narrativa | ✅ | | |
| Triângulo serviço | ✅ | | |
| Medição **por serviço** | ✅ | | |
| Gantt **diário** UX | | ✅ | |
| EAP **pré-obra** | | ✅ | |
| EAP **4 dígitos custo** | | ✅ | |
| A11y de template | | ✅ | |
| Responsável em tarefa | parcial | ✅ | |
| Medição **global parcelas** | | | ✅ |
| Código `01.01` | | | ✅ |
| Contagem status dashboard | | | ✅ |
| SUMIF produção→% | | | ✅ |
| Relatório ultra-enxuto | | | ✅ |

---

## 5. Recomendação de backlog (após decisões C*/U2)

| Prioridade | Item | Origem |
|------------|------|--------|
| Alta | Medição global + parcelas | P3-U1 |
| Alta | Gantt escala dia/semana/mês (viewport 8 sem) | P2-U1, P2-U6, C6 |
| Alta | Enums/Status + unidades normalizadas | P1-U8, C4, C8 |
| Alta | Serviço triângulo + derivados | P1-U12, P1-U11 |
| Média | Categorias de custo P2 | P2-U3 |
| Média | Pré-obra (se U2=sim) | P2-U2 |
| Média | CPM/predecessors | P1-U2 |
| Média | KPIs narrativos revalidados | P1-U9, C7 |
| Média | BDI | P1-U4, C10 |
| Baixa | Caminho crítico | P1-U3 |
| Baixa | Controle stub | P1-U17 |
| Não | Proteção de aba | P2-U8 |
