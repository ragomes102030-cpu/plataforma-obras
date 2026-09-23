# Matriz Comparativa — 3 Planilhas de Referência

> **Escopo**: análise independente de 3 arquivos Excel usados como referência de domínio para a plataforma de obras.
> **Status**: análise concluída — nenhuma implementação foi feita a partir deste documento.
> **Data da auditoria**: 2026-09-21

---

## 1. Identificação dos arquivos

| Código | Arquivo | Tamanho | Abas | Fórmulas | Papel aparente |
|--------|---------|---------|------|----------|----------------|
| **P1** | `ARES_MODELO_EXCEL_NATIVO_MVP_LOB_PROFISSIONAL_FINAL_WORK(3).xlsx` | 164.673 B | 19 | ~1.660 | Modelo completo LOB (Linha de Balanço) / CPM — sistema-piloto ARES |
| **P2** | `Planilha-de-Relatorio-de-Progresso-de-Obra(3).xlsx` | 495.286 B | 4 | 933 | Template Microsoft de relatório de progresso com Gantt semanal + EAPs de referência |
| **P3** | `Relatorio_Progresso_Obra_PROFISSIONAL.xlsx` | 16.562 B | 6 | 117 | Relatório de progresso enxuto (dashboard, cronograma, medições, produção) |

**Obra-amostra comum (P1 e P3)**: Residencial Piemarta · Empresa B Engenharia · 2 torres · 14 pavimentos · 6 apts/pav · início 05/01/2026 · término previsto 30/06/2027.
**P2**: template genérico — "PRÉDIO BEAUTY - ANDAR 1", Construtora Budd, responsável Ricardo Lanny Budd, início 17/09/2026 (datas de exemplo em 2024).

---

## 2. Inventário de abas

### P1 — ARES (19 abas)

| Aba | Linhas×Col | Fórmulas | Charts/Tables | Papel |
|-----|-----------|----------|---------------|-------|
| DASHBOARD | 47×26 | 7 | 1 chart | Painel executivo (KPIs + resumo de serviços + curva mensal) |
| CADASTRO | 247×26 | 0 | 2 tables | Dados da obra + hierarquia de locais (`LOCAL-T1` → pav → ap) |
| EAP | 91×10 | 85 | 1 table | WBS 3 níveis (DISCIPLINA/PACOTE/TRABALHO), col. contagem serviços |
| ORÇAMENTO | 59×29 | 104 | 2 tables | Itens ORC-xxx, composição, BDI, formação de preço (**11 errorCells**) |
| SERVIÇOS | 72×13 | 55 | 1 table | SERVICO = EAP × FRENTE × LOCAL; QTD/UN/PRECO; docs de domínio |
| PLANEJAMENTO | 52×26 | 165 | 2 tables | Fonte única do cronograma; 15 atividades legadas + colunas derivadas (H,J,M,N,Q) |
| FRENTES | 41×9 | 16 | 3 tables | 15 frentes + cadastro transitório de equipes + classificação "o que não é frente" |
| REDE | 21×7 | 0 | 1 table | 17 elos FS com lag e origem da regra (R1/R1-SUBST/R6) |
| LINHA DE BALANÇO | 55×82 | **944** | 0 | Grade tempo×serviço, obra 05/01/2026→30/06/2027, HOJE=TODAY() |
| CAMINHO CRÍTICO | 3×8 | 0 | 0 | **Stub** — "aguarda modelagem" |
| GANTT | 22×61 | 0 | 0 | Barras por semana, data-base 18/08/2026, legenda de status |
| RECURSOS | 108×20 | 0 | 3 tables | MO/EQUIPAMENTO/MATERIAL + composição equipe + necessidade serviço + legado mão-de-obra |
| PRODUÇÃO | 47×26 | 117 | 1 table | Apontamento diário PREVISTA/PRODUZIDA/ACUMULADO; resumo total |
| MEDIÇÃO | 20×26 | 81 | 1 table | Períodos, CONTRATADO/EXECUTADO/MEDIDO, valores, saldo, %MED, status (**23 errorCells**) |
| CONTROLE | 3×5 | 0 | 0 | **Stub** — "aguarda modelagem" |
| INDICADORES | 11×26 | 6 | 0 | 7 indicadores com VALOR/REFERÊNCIA/STATUS/leitura narrativa |
| GRÁFICOS | 50×26 | 5 | 5 charts | Planejado×realizado mensal + produção acumulada |
| FÓRMULAS | 14×26 | 0 | 0 | Catálogo documental de 10 fórmulas (P, D, %Prod, %Med, Vm, S, Cr, Pm, %Plan, Sp) |
| CONFIGURAÇÕES | 50×9 | 1 | 0 | 10 listas de domínio controlado + BDI composto TCU (0 = pendente) |

### P2 — Template de Relatório (4 abas)

| Aba | Linhas×Col | Fórmulas | Papel |
|-----|-----------|----------|-------|
| Cronograma em Gantt | 5000×520 | 933 | Gantt **diário** (8 semanas visíveis, col I→BL), fases + tarefas, progresso %, responsável, barra de hoje #AD3815; template Microsoft com instruções em col A; contém `#REF!` |
| EAP Física - Serviços | 5000×52 | 0 | Catálogo **físico** de referência: Viabilidade→Projeto→Projeto Legal→…→entrega (Referência + Descrição); 0 fórmulas |
| EAP Orçamento - Serviços | 5000×52 | 0 | Catálogo **orçamentário**: DESPESAS INICIAIS(1xxx), SERVIÇOS TÉCNICOS(2xxx), INSTALAÇÕES PROVISÓRIAS(3xxx)… numeração 4 dígitos |
| Sobre | 45×21 | 0 | Metadados do template; **aba protegida** (SHA-512), zoom 85 |

### P3 — Relatório Profissional (6 abas)

| Aba | Linhas×Col | Fórmulas | Papel |
|-----|-----------|----------|-------|
| DASHBOARD | 18×10 | 20 | 6 KPIs + tabela situação por status (Concluído/Em andamento/Atrasado/Não iniciado) |
| RESUMO | 16×6 | 0 | Identificação da obra + resumo textual (contrato, prazo, situação) |
| CRONOGRAMA | 18×13 | 74 | 14 atividades hierárquicas `01.01`…`07.01`; Duração, Produtividade, %Plan/%Real, Status |
| GANTT | 17×20 | 0 | Visual **mensal** (01/26→06/27), 1 célula = 1 mês |
| MEDICOES | 10×9 | 22 | 6 medições MED-01…06: %Acum, Valor Acum, Parcela, Saldo, Status (Aprovada/Em análise) |
| PRODUCAO | 59×5 | 1 | Lancamentos QTD_PRODUZIDA por atividade; nota: "CRONOGRAMA le esta aba por SUMIF" |

---

## 3. Matriz de domínio (núcleo do entregável)

**Legenda de Duplicado/Conflito**:
- `COMUM` = mesmo conceito nas 3 (ou nas que o têm) — candidato a modelo único
- `EXCLUSIVO` = só em uma planilha
- `DUPLICADO` = mesmo conceito modelado 2+ vezes com estruturas diferentes
- `CONFLITANTE` = regras/valores divergem — **decisão manual necessária**
- `OBSOLETO` / `PENDENTE` = marcado como legado ou "aguarda/pendente de definição" na própria planilha

| Domínio | Planilha 1 (P1 ARES) | Planilha 2 (P2 Template) | Planilha 3 (P3 Profissional) | Duplicado? | Conflito? | Observação | Fonte de verdade proposta |
|---------|----------------------|--------------------------|------------------------------|-----------|-----------|------------|---------------------------|
| **Identificação de obra** | CADASTRO: Empresa B, Piemarta, OBRA-001, 2 torres, 14 pav, 6 ap/pav, cliente, início/término | B1–B3: título/empresa/responsável livres | RESUMO + DASHBOARD header: Piemarta, Empresa B, data-base 15/07/2026 | Sim (P1+P3) | **Sim** — data-base diverge (P1: 18/08/2026; P3: 15/07/2026; P2: 17/09/2026) | P2 é template sem obra real | **P1 CADASTRO** (estruturado, campos estáveis) |
| **Hierarquia de locais** | CADASTRO: `LOCAL-T{torre}-P{pav}-AP{nn}` (~245 linhas), tabela Local ID/Tipo/Descrição/Pai | — | Coluna `Pavimento` textual (SB, PL, P01-P05…, GERAL) | Não | **Sim** — granularidade difere (árvore completa vs rótulo) | P3 não tem localização por unidade | **P1 CADASTRO** |
| **EAP / WBS** | EAP: código 1/15.1/16.1.1 + `EAP-001…085`, TIPO ∈ {DISCIPLINA, PACOTE, TRABALHO}, pai em col E, nível col F, `COUNTIFS(tbServicos[EAP_ID])` | EAP Física: referência `1`, `1.1`… descrição (viabilidade→entrega); EAP Orçamento: `1`, `1001`… (4 dígitos) | Não tem EAP separada — atividades no CRONOGRAMA com código `01.01` | **Sim** (3 estruturas) | **Sim** — P1 usa IDs `EAP-xxx` + 3 tipos; P2 usa duas EAPs (física decimal / orçamento 4-dígito); P3 não tem | P2 EAP Orçamento é **categoria de custo**, não WBS de escopo | **P1 EAP** como WBS de escopo; P2 orçamento mapeia para itens ORC (ver §5) |
| **Serviço (unidade operacional)** | SERVIÇOS: `SERVICO-001…012`+ = EAP × FRENTE × LOCAL; UN, QTD_CONTRATADA, PRECO_UNITARIO, VALOR_CONTRATADO derivado; duplicidade EAP+FRENTE+LOCAL **sinalizada, não bloqueada** | Tasks do Gantt: nome livre + responsável + progresso % (sem FK estrutural) | Atividade do CRONOGRAMA: código hierárquico + Frente + Pavimento (sem LOCAL fino) | Não (P1 é o único modelo relacional de serviço) | **Sim** — P2/P3 tratam "atividade" como tarefa de cronograma; P1 separa SERVIÇO (contratual) de ATIVIDADE (planning) | Conceito **SERVIÇO ≠ ATIVIDADE** documentado explicitamente em P1 | **P1 SERVIÇOS** para domínio contratual; atividade de cronograma → P1 PLANEJAMENTO / P3 CRONOGRAMA |
| **Frente / equipe** | FRENTES: `FRENTE-001…015`, TIPO ∈ {EXECUÇÃO, ACABAMENTO, INSTALAÇÃO}, STATUS ∈ {Ativa, Inativa, Descontinuada}; equipes `EQUIPE-001…011` transitório; `COUNTIFS(tbServicos[FRENTE_ID])` | Coluna "ATRIBUÍDO PARA" (pessoa, texto livre) | Coluna Frente ∈ {EXECUCAO, ACABAMENTO, INSTALACAO} + Equipe ∈ {Equipe A…D} | Sim (P1+P3) | Parcial — P3 repete TIPO de frente de P1 mas sem IDs; P2 não modela frente | P1 marca equipes como "transitório → migração para RECURSOS" | **P1 FRENTES** (IDs + tipo + status) |
| **Localização × frente × escopo** | Composição explícita SERVIÇO = EAP × FRENTE × LOCAL (regra documentada em SERVIÇOS/ORÇAMENTO/RECURSOS) | — | Combinação implícita Frente + Pavimento na atividade | Não | Não | Só P1 formaliza o triângulo | **P1** |
| **Orçamento / composição / BDI** | ORÇAMENTO: ORC-xxx, TIPO_ITEM ∈ {SERVIÇO, ESPECIAL}, COMPOSIÇÃO (recurso×coeficiente), CUSTO_UNIT = Σ parciais, BDI composto TCU em CONFIGURAÇÕES, VALOR_ORCADO = QTD × PREÇO (derivado); cadeia ORC→SERVICO→EAP/FRENTE/LOCAL→RECURSO | EAP Orçamento: **lista de categorias** 1001/2001/3001… sem valores | — | Não (só P1 tem valores; P2 tem taxonomia) | Taxonomia P2 × códigos ORC-xxx P1 **não alinhados** | P2 fornece **vocabulário de custos**, P1 fornece **motor de cálculo** | **P1 ORÇAMENTO + CONFIGURAÇÕES BDI**; mapear P2 1001/2001/… → grupos ORC (pendente) |
| **Recursos (insumos)** | RECURSOS: MÃO DE OBRA/EQUIPAMENTO/MATERIAL, CUSTO_UNITARIO, CAPACIDADE_DIA, vínculo Equipe×Recurso e Serviço×Recurso; legado "MÃO DE OBRA" preservado sem migração | — | — | Exclusivo P1 | Não | EQUPE transitória (FRENTES) + RECURSOS + legado MO = **3 camadas** | **P1 RECURSOS**; aposentar legado MO e encurtar permanência de EQUIPE em FRENTES |
| **Cronograma (fonte de dados)** | PLANEJAMENTO: 15 atividades `*-ATV`, PREDECESSORA, QTD, PRODUT, DURAÇÃO, INÍCIO/FIM, %PLAN/%REAL, STATUS (concluido/em_andamento/…) — "fonte única; GANTT deriva" | Cronograma em Gantt: fases+tarefas, início/fim/progresso, janela 8 semanas | CRONOGRAMA: 14 atividades `01.01`…, Duração=(Fim−Inicio)+1, Produtividade=Qtd/Duração, %Planej/%Real, Status | Sim (3 modelagens) | **Sim** — granularidade (semanal/diário × mensal), vocabulário de status (snake_case P1 × title case P3), código (`EST-ATV2` × `03.02`) | P1 declara PLANEJAMENTO como fonte única do GANTT; P3 declara PRODUCAO→CRONOGRAMA via SUMIF | **P1 PLANEJAMENTO** (mais campos, precedências, tipos de atividade); absorver Produtividade/Duração de P3 |
| **Rede de precedências / CPM** | REDE: 17 elos FS, DEFASAGEM (lag), ORIGEM (R1 legado, R1-SUBST, R1-ATIVO, R6 mesma equipe); CAMINHO CRÍTICO **stub** | — | — | Exclusivo P1 (parcialmente) | Não | CPM **não implementado** (aba vazia) | **P1 REDE**; CAMINHO CRÍTICO = feature a implementar |
| **Gantt (render)** | GANTT semanal (col G→…), barras por status, data-base fixa 18/08/2026 | Gantt **diário** 8 semanas, formatação condicional, hoje destacado | Gantt **mensal** 18 colunas | Sim (3 visuais) | **Sim** — escala temporal e mecanismo (cor/format cond.) | Só P2 tem escala diária real | Escala **configurável**; P2 = referência UX diária, P1 = semanal operacional, P3 = mensal executivo |
| **Produção (execução física)** | PRODUÇÃO: DATA, SERVIÇO, FRENTE, EQUIPE, LOCAL, PREVISTA, PRODUZIDA, META, DESVIO, ACUMULADO, %EXEC; resumo previsto×produzido | — | PRODUCAO: Data, Código Atividade, Qtd Executada, Equipe, Observacao; alimenta %Real do CRONOGRAMA | Sim (P1+P3) | Parcial — P1 detalha local/frente/meta; P3 é lançamento minimalista | P1 col L `% EXEC` mostra 0% (fórmula/comparação a revisar — candidato a bug na planilha) | **P1 PRODUÇÃO** (mais dimensões); granularidade de lançamento de P3 se P1 pesar |
| **Medição (financeiro/contratual)** | MEDIÇÃO: períodos iniciais/finais, SERVIÇO, CONTRATADO, EXECUTADO, MEDIDO, PREÇO, VALOR MEDIDO/ACUM/SALDO, %MED, status `aprovada`; resumo contrato/medido/saldo (**23 erros**) | — | MEDICOES: MED-01…06, N, Data, %Acum, Valor Acum, Parcela, Saldo a Medir, Status Aprovada/Em análise, Obs | Sim (P1+P3) | **Sim** — P1 é **por serviço/medição parcial**; P3 é **medições globais do contrato (Nº)**; granularidade oposta | Erro `#DIV/0!`/`#VALUE!` em P1 = contrato/preços zerados na amostra | Modelo **híbrido**: medições globais (P3) com rateio/detalhe por serviço (P1) — **decisão #1** |
| **Indicadores / dashboard** | DASHBOARD (KPIs + 11 serviços + curva) + INDICADORES (7 com narrativa) + GRÁFICOS (5) | — | DASHBOARD (6 KPIs + status counts) | Sim (P1+P3) | Parcial — métricas **não batem** (ver §4) | P1 INDICADORES tem textos contradictórios (ex.: produção 0% no valor vs 72,5% na leitura) | **P1 DASHBOARD+INDICADORES** (ricos); validar contas antes de portar |
| **Linha de balanço (LOB)** | LINHA DE BALANÇO 944 fórmulas, grade tempo×serviço, KPIs no topo | — | — | Exclusivo P1 | Não | Presente no produto (módulo LOB) | **P1** |
| **Fórmulas canônicas** | Aba FÓRMULAS: 10 fórmulas documentadas (un/h, dias, %, R$) | — | Duração e Produtividade documentadas no cabeçalho do CRONOGRAMA | Sim (P1+P3 parcial) | Não — P3 é subconjunto | P1 é catálogo completo | **P1 FÓRMULAS** |
| **Domínios controlados / listas** | CONFIGURAÇÕES: 10 LISTA_* (tipos recurso, unidades, statuses, tipos EAP/frente/serviço/atividade/item/planejamento) + BDI | — | Status de medição/atividade em uso mas **sem lista central** | Exclusivo P1 estruturado | Vocabulários de status **divergem** (ver §4) | P2/P3 validação só por hábito de template | **P1 CONFIGURAÇÕES** |
| **BDI / formação de preço** | CONFIGURAÇÕES F40:I49: componentes Admin Central, Seguros, …, Lucro, Tributos; fórmula TCU `[(1+AC)(1+S)(1+G)(1+R)(1+DF)(1+L)/(1−T)]−1`; BDI_TOTAL=0 (PENDENTE) | — | — | Exclusivo P1 | Não — **0% = pendente de definição** | Percentuais "somente com fonte" | P1 — **aguarda preenchimento com fonte** |
| **Status de planejamento** | PLANEJAMENTO/CONFIG: `concluido/em_andamento/atrasado/planejado` (dados) e lista `NÃO INICIADO/EM ANDAMENTO/CONCLUÍDO/ATRASADO`; fórmula col Q deriva status p/ tipos não-manuais | Progresso % puro (sem status) | `Concluido/Em andamento/Nao iniciado` (sem "Atrasado" nos dados) | Sim | **Sim** — vocabulário e semântica (P1 tem BLOQUEADO/CANCELADO→MANUAL) | P3 não usa status atrasado no dataset | Unificar em enum único — **decisão #2** |
| **Unidades** | LISTA_UNIDADES: m², m³, m, ml, un, vb, pt, kg, t, h | — | unid textuais: vb, m3, m2, m | Sim | Parcial — `m³`×`m3`, cobertura menor em P3 | Normalização de string necessária | **P1 lista** + normalizador de import |
| **Campos derivados proibidos (digitados)** | Documentado: VALOR_CONTRATADO, VALOR_ORCADO, CUSTO_DIRETO, PRECO_UNITÁRIO(com BDI) = derivados; ORÇADO≠CONTRATADO≠PRODUZIDO≠MEDIDO | — | Fórmulas calculam Duração/Produtividade/% no arquivo | P1 explícito | Não | Guardrails de integridade úteis ao produto | **P1** (regras de domínio) |
| **Proteção / metadados de template** | — | Aba Sobre protegida; instruções de leitor de tela; `#REF!` residual | — | Exclusivo P2 | — | Não portar proteção; usar só UX/instruções | — |

---

## 4. Conflitos e divergências (resumo — detalhe em `docs/analise-planilhas/conflitos.md`)

1. **Data-base da obra**: P1 18/08/2026 · P3 15/07/2026 · P2 17/09/2026 — mesmas obras P1/P3, datas diferentes.
2. **Granularidade de medição**: P1 por serviço/período vs P3 por medição global numerada do contrato.
3. **Código de cronograma**: `EST-ATV2` (P1) vs `03.02` (P3) vs task name (P2) — sem tabela de equivalência.
4. **Vocabulário de status**: snake_case/title case, conjuntos diferentes (P1 inclui BLOQUEADO/CANCELADO/Liberado; P3 não tem atrasado nos dados).
5. **Estrutura de EAP**: 3 modelos paralelos (P1 ID+tipo, P2 física decimal, P2 orçamento 4-dígito) — P2 orçamento ≠ WBS de escopo.
6. **Escala de Gantt**: diária (P2) × semanal (P1) × mensal (P3).
7. **Métricas de dashboard** (P1 vs P3, mesmo mês de deslocamento): produção física ≠ medição ≠ planejado — leituras narrativas de P1 INDICADORES contradizem os valores mostrados (0% vs 72,5%).
8. **Unidades**: `m³`/`m²` (P1) vs `m3`/`m2` (P3).
9. **Integridade P1**: 11 erros em ORÇAMENTO + 23 em MEDIÇÃO + `#REF!` no template P2 + `#OCLI_NOTEVAL!` = fórmulas não avaliadas pelo leitor CLI (recalcular no Excel/LibreOffice antes de confiar em caches).

---

## 5. Modelo de domínio consolidado (proposta — ver doc dedicado)

Entidades sugeridas, com **fonte de verdade**:

| Entidade | Fonte primária | Absorve de |
|----------|----------------|------------|
| `Obra`, `Local` (árvore) | P1 CADASTRO | identificação P3 RESUMO |
| `Eap` (WBS, tipo, pai) | P1 EAP | taxonomia de custo P2 → `CategoriaOrcamento` (entidade separada) |
| `Frente`, `Equipe` | P1 FRENTES | labels P3; P2 responsável = `Pessoa` em tarefa |
| `Servico` (EAP×FRENTE×LOCAL, qty, preço) | P1 SERVIÇOS | — |
| `Recurso`, `Composicao`, `ServicoRecurso` | P1 RECURSOS/ORÇAMENTO | — |
| `OrcamentoItem`, `Bdi` | P1 ORÇAMENTO+CONFIG | categorias P2 como agrupador |
| `Atividade` (cronograma), `Precedencia` | P1 PLANEJAMENTO+REDE | Produtividade/Duração P3; fases P2 |
| `Producao` | P1 PRODUÇÃO | colunas mínimas P3 |
| `Medicao` (global) + `MedicaoItem` (por serviço) | P3 MEDICOES + P1 MEDIÇÃO | **decisão #1** |
| `Indicador`, `Dashboard` | P1 INDICADORES/DASHBOARD | blocos P3 DASHBOARD |
| `LinhaBalanco` | P1 LOB | — |
| `Unidade`, enums de status | P1 CONFIGURAÇÕES | normalização P3 |

---

## 6. Funcionalidades únicas por planilha

- **Só P1**: LOB completa, REDE/CPM (stub caminho crítico), BDI TCU, composições de custo, catálogo de fórmulas, domínios controlados, hierarquia de locais, 19 abas integradas, indicadores narrativos, classificação "o que não é frente", regras anti-conflito de domínio.
- **Só P2**: Gantt diário com janela rolável de 8 semanas, EAP física de ciclo de vida (viabilidade→entrega — **fase pré-obra ausente em P1/P3**), EAP orçamentária numérica 4 dígitos, acessibilidade/instruções de template, aba Sobre protegida, progresso por responsável.
- **Só P3**: medições globais numeradas com parcela/saldo, código hierárquico de atividade (`01.01`), Produtividade/dia explícita, dashboard de contagem por status com % do total, enxutz (6 abas / 16 KB).

---

## 7. Regras conflitantes → decisão manual

Listadas para aprovação humana em `docs/analise-planilhas/regras-conflitantes.md`:

1. Qual granularidade de **medição** é obrigatória (global, por serviço, ou ambas)?
2. Qual **data-base** e calendário oficiais da obra Piemarta?
3. Unir EAPs P2 (física/orçamento) no produto ou manter só WBS P1 + categorias de custo?
4. Vocabulário único de **status** de atividade e de serviço?
5. Escala padrão de Gantt no produto (semanal/diária/mensal)?
6. Pré-obra (viabilidade/projeto/legal) da EAP física P2 entra no escopo do produto?
7. Como mapear códigos P2 (1001…) para ORC-xxx / grupos P1?
8. Aceitar equipes transitórias (FRENTES) como entidade permanente ou migrar 100% para RECURSOS?

---

## 8. Plano por prioridade (análise → implementação)

**Só após decisão do usuário.** Antecipação em `docs/analise-planilhas/plano-implementacao.md`.

| Fase | Prioridade | Itens | Por quê |
|------|------------|-------|---------|
| 0 | Alta (pré-req) | Decidir §7 (8 itens) | Evita retrabalho de schema |
| 1 | Alta | Schema: Obra/Local/EAP/Servico/Frente/Producao/Medicao(s) + enums CONFIG | Base de todas as telas |
| 2 | Alta | Pipeline carga: normalizar unidades, mapear códigos P3, validar FKs, recalcular fórmulas P1 | Dados confiáveis |
| 3 | Média | Cronograma + precedências + Gantt escala configurável | Funcionalidade central com 3 referências |
| 4 | Média | Orçamento/BDI/composição (quando BDI tiver fonte) | Bloqueado por fonte de % |
| 5 | Média | Medições (modelo híbrido) + indicadores/dashboard | Conflito #1 resolvido na Fase 0 |
| 6 | Baixa | LOB, caminho crítico (stub→implementar), gráficos | P1-only / stub |
| 7 | Baixa | UX de template P2 (a11y, janela de semanas) | Enriquecimento |

---

## 9. Arquivos desta análise

| Arquivo | Conteúdo |
|---------|----------|
| `docs/MATRIZ_COMPARATIVA_3_PLANILHAS.md` | Este documento (matriz + resumo) |
| `docs/analise-planilhas/auditoria-p1.md` | Auditoria individual P1 |
| `docs/analise-planilhas/auditoria-p2.md` | Auditoria individual P2 |
| `docs/analise-planilhas/auditoria-p3.md` | Auditoria individual P3 |
| `docs/analise-planilhas/conflitos.md` | Matriz de conflitos detalhada |
| `docs/analise-planilhas/modelo-dominio.md` | Modelo de domínio consolidado |
| `docs/analise-planilhas/matriz-planilha-sistema.md` | Planilha × sistema (o que já existe / gap) |
| `docs/analise-planilhas/funcionalidades-unicas.md` | Exclusivos por planilha |
| `docs/analise-planilhas/regras-conflitantes.md` | 8 perguntas de decisão |
| `docs/analise-planilhas/plano-implementacao.md` | Plano por prioridade |

**Nenhum código do sistema foi alterado por esta análise.**
