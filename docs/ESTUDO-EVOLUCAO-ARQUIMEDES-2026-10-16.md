# Arquimedes — Estudo de maturidade e evolução

**Data:** 16/10/2026 · **Base analisada:** `main` @ `ec0aa21` · **Obras reais:** 3 ativas (7, 8, 14)

> **Leitura em 60 segundos.** O Arquimedes não é um chatbot de obra com um Gantt
> colado: é um sistema de planejamento com motor CPM determinístico, EAP versionada
> com porte de aprovação, 10 regras de coerência de engenharia e um agente que
> executa 23 ferramentas com memória, evidência e orçamento de rodadas. Isso o
> coloca **à frente da maioria dos concorrentes no núcleo de engenharia** e
> **atrás deles em plataforma** (observabilidade, avaliação, governança de dados,
> interoperabilidade). Nota de maturidade: **3,2 / 5 — fim do nível N3 (sistema em
> produção), na fronteira do N4 (plataforma confiável e mensurável)**. O que separa
> o Arquimedes do próximo nível não é mais funcionalidade: é **prova** — medir,
> alertar, avaliar e governar. O plano abaixo leva ~6 meses até o N4 e ~10 meses
> até o N5 (copiloto de engenharia auditável), se a prioridade for essa.

---

## 1. Método e evidências

O estudo usou dois canais, como pedido:

1. **Código e banco (canal externo).** Leitura do repositório no commit `ec0aa21`,
   contagem de arquivos/linhas, inspeção do schema (37 tabelas, 13 migrações, 102
   índices, 70 FKs), consulta ao banco de produção e leitura dos 7 workflows de CI.
2. **O agente por dentro (canal interno).** Leitura do orquestrador, do roteador de
   skills, do módulo de memória, do motor CPM (`shared/cpm.ts`), do validador de EAP
   e das 10 regras de coerência; análise da telemetria real de execução
   (`agent_runs` / `agent_run_events`).

Números usados neste documento (todos verificáveis, ver Apêndice A):

| Métrica | Valor |
|---|---|
| Arquivos versionados | 501 |
| `server/` | 155 arquivos · 33.735 linhas |
| `client/src/` | 59 arquivos · 9.643 linhas |
| `scripts/` + `docs/` | 66 + 69 arquivos · 9.941 + 9.014 linhas |
| Procedures tRPC | 101, em 10 sub-routers |
| Testes | 784 passando, 82 arquivos |
| Ferramentas do agente | 23 |
| Execuções do agente registradas | 115 (2.537 eventos) |
| Iterações médias / máximas | 2,96 / 8 (teto do orquestrador) |
| Latência média / máxima | 34,7 s / 84,6 s |
| Falhas de execução | 5 (4,3%) |
| Memórias do agente | 64 (56 em `proposed`, 4 aprendizados aprovados) |
| Cobertura de testes medida | 0% (nenhuma ferramenta configurada) |
| RLS | 0 de 37 tabelas |

---

## 2. O que o Arquimedes é hoje

Cinco camadas, com qualidades desiguais:

1. **Domínio** — EAP versionada (`project_plan_versions` com `draft/approved/superseded`),
   uma atividade por folha por versão, dependências sem auto-laço e sem cruzamento de
   versão, uma única versão aprovada por obra. Integridade verificada: 0 violações.
2. **Motores determinísticos** — CPM com os quatro tipos de relação (FS/SS/FF/SF),
   lag, restrições, folga livre, caminho crítico e detecção de infactibilidade
   (`shared/cpm.ts`); calendário de obra; validador de EAP de 879 linhas; 10 regras de
   coerência de engenharia (1.262 linhas + 1.614 linhas de teste) que cruzam EAP,
   cronograma, orçamento, unidades, BDI, fck e área construída.
3. **Agente** — orquestrador de 2.442 linhas, 23 ferramentas, teto de 8 iterações,
   orçamentos explícitos (2 análises de lacuna, 3 pesquisas externas), roteamento de
   ≤4 playbooks por tarefa, memória com ciclo de aprovação, evidência classificada
   (fato da obra / referência externa / inferência) e telemetria por evento.
4. **Produto** — 101 procedures, central de comando, abas de EAP, cronograma, catálogo,
   orçamento, produção, documentos; importação de planilhas SINAPI-like (23.128
   composições, 12.136 insumos).
5. **Plataforma** — Node/TypeScript, Drizzle/PostgreSQL, React, GitHub OAuth,
   DockHosting, 4 guardas de CI, headers de segurança e rate limit.

**A tese do produto já está certa:** planejamento de obra em que o agente propõe, o
motor determinístico verifica e o engenheiro aprova. Poucos concorrentes têm as três
coisas juntas. O problema é que a terceira (prova operacional) ainda é frágil.

---

## 3. Benchmark de mercado

O mercado relevante não é um só. São cinco camadas, e o Arquimedes disputa três.

### 3.1 Camada de cronograma e CPM

| Ferramenta | Referência | O que define o estado da arte |
|---|---|---|
| Oracle Primavera P6 / Primavera Cloud | Padrão enterprise | Múltiplos calendários, resource leveling, baselines, actuals/data date, EVM, portfólio |
| Microsoft Project / Project for the web | Padrão de escritório | CPM, calendários, nivelamento, baselines, integração Office |
| Elecosoft Asta Powerproject | Padrão europeu | CPM multi-calendário, nivelamento, progresso, colaboração |
| ALICE Technologies | IA generativa | Geração e otimização de alternativas de cronograma por recursos |
| nPlan | IA preditiva | Previsão de risco e duração a partir de histórico de cronogramas |
| Synchro / Navisworks | 4D | Ligação cronograma↔modelo BIM |

**Arquimedes:** CPM correto e testado, com restrições e calendário — mas **sem
nivelamento de recursos, sem data date/actuals reprojetados, sem EVM, sem
multi-calendário e sem import/export P6/MS Project**. Cobre ~60% do núcleo de um P6
para uma obra, e 0% da escala de portfólio.

### 3.2 Camada de gestão de obra e orçamento

| Ferramenta | Referência | Estado da arte |
|---|---|---|
| Procore | Gestão de obra | Orçamento, change orders, RFIs, submittals, diário, progresso, agentes de IA sobre documentos |
| Autodesk Construction Cloud | Documentos + modelo | Docs, coordenação, takeoff, Build, assistente de IA |
| Trimble Viewpoint / CMiC | ERP de construção | Financeiro, compras, contratos, custos integrados |
| Buildertrend | Residencial | Cliente, cronograma, orçamento, comunicação |

**Arquimedes:** forte em **planejamento** (EAP, CPM, orçamento por composição), fraco
em **execução** (medição, diário, RFI, compras, contrato). Não é concorrente de
Procore em amplitude — e não deve tentar ser.

### 3.3 Camada de orçamento e quantitativos

| Ferramenta | Referência | Estado da arte |
|---|---|---|
| CostOS / Candy (CCS) | Orçamento técnico | Composições, produtividade, recursos, BDI, curvas |
| Sage Estimating / Accubid | Estimativa | Bases de custo, assemblies, relatórios |
| Togal.AI / Kreo / Beam | Takeoff por IA | Medição automática sobre planta/pdf |
| Planilhas SINAPI/TCPO/SEINFRA | Base brasileira | Insumos, composições, preços referenciais |

**Arquimedes:** já tem a base (23 mil composições importadas, BDI, auditoria de
preço/unidade) e uma vantagem rara: **coerência entre orçamento, EAP e cronograma**.
Falta o elo quantitativo explícito (quantidade da EAP → composição → custo) e a
medição física-financeira fechada.

### 3.4 Camada de agentes de IA para construção

| Ferramenta | Referência | Estado da arte |
|---|---|---|
| Trunk Tools | Agentes sobre documentos | Ingestão de documentos, respostas citadas, agentes especializados |
| Document Crunch | Contratos | Extração e risco contratual com referência à cláusula |
| Buildots / OpenSpace / Doxel | Progresso real | Visão computacional sobre fotos/360 para medir avanço |
| ALICE / nPlan | Planejamento com IA | Otimização generativa e previsão por histórico |

**Arquimedes:** arquitetura de agente **comparável ou superior** em fundamentação
(ferramentas determinísticas, evidência, memória, skills), mas **inferior em
ingestão de documentos e em volume de uso**. A telemetria mostra 115 execuções, média
de 2,96 iterações: o agente está sendo usado como **conversa operacional**, não como
planejador profundo. O teto de 8 iterações já foi atingido pelo menos uma vez.

### 3.5 Camada de plataforma de agentes (referência técnica)

| Plataforma | O que ensina |
|---|---|
| OpenAI Agents SDK / Responses | Tool calling, tracing, guardrails, avaliações |
| Claude Agent SDK + MCP | Ferramentas padronizadas, subagentes, permissões |
| LangGraph / LangSmith | Estado explícito, checkpoint, observabilidade de traço |
| CrewAI / AutoGen | Orquestração multiagente (mais teatro do que engenharia, na maioria dos casos) |

**Arquimedes:** já usa MCP e um runtime ReAct próprio com orçamento — decisão correta.
O que falta é o que essas plataformas vendem junto: **avaliação, tracing com custo e
política de permissão**.

### 3.6 Síntese competitiva

| Dimensão | P6/ALICE | Procore/ACC | Trunk/Document Crunch | **Arquimedes** |
|---|---|---|---|---|
| Profundidade CPM | 5 | 2 | 0 | **3** |
| EAP + engenharia | 2 | 2 | 1 | **4,2** |
| Orçamento/medição | 3 | 4 | 1 | **2,4** |
| Agente fundamentado | 2 | 3 | 4 | **3,6** |
| Operação/observabilidade | 5 | 5 | 4 | **2** |
| Interoperabilidade | 5 | 5 | 3 | **2** |
| Diferencial único | otimização | amplitude | documentos | **prova de engenharia** |

Conclusão do benchmark: **o Arquimedes não ganha por amplitude nem por escala. Ganha
se for o único que prova o que afirma sobre a obra** — cada número rastreável até a
EAP, o orçamento, o cronograma e a norma. Esse é o posicionamento defensável.

---

## 4. Nota de maturidade

Rubrica de 0 a 5, pesos por impacto no negócio. Nota não é opinião: cada linha cita a
evidência que a sustenta.

| # | Dimensão | Peso | Nota | Evidência |
|---|---|---|---|---|
| 1 | Domínio e integridade de dados | 15% | **4,0** | 0 violações de versão/dependência/duração; porte de aprovação; 35 atividades legadas com `versionId` nulo em obras mortas (−) |
| 2 | EAP e coerência de engenharia | 15% | **4,2** | Validador de 879 linhas, 10 regras, 1.614 linhas de teste, regras com falso-positivo tratado |
| 3 | Motor de cronograma | 12% | **3,0** | 4 tipos de relação, lag, restrições, folga, caminho crítico; sem nivelamento, data date, EVM, calendários múltiplos |
| 4 | Orçamento, medição e LOB | 12% | **2,4** | 23 mil composições, BDI, auditoria de preço; medição/LOB dependem de MCP externo; sem laço físico-financeiro fechado |
| 5 | Arquitetura de agente | 15% | **3,6** | 23 ferramentas, memória, skills, evidência, orçamentos; monólito de 2.442 linhas; equipe de engenharia simulada |
| 6 | Operação do agente (avaliação/custo) | 6% | **2,1** | Tracing por evento, mas sem tokens/custo, sem duração por ferramenta, sem conjunto de avaliação, 56/64 memórias paradas em `proposed` |
| 7 | Confiabilidade e observabilidade | 8% | **2,0** | Sem Sentry/OpenTelemetry, sem alerta de 5xx, sem painel, sem SLO; `/healthz` e `/readyz` são o único sinal |
| 8 | Segurança e governança | 7% | **2,6** | Helmet/CORS/rate limit, guarda de acesso testada em todas as procedures com `projectId`; 0 RLS, rotação de senha pendente |
| 9 | Engenharia de software (CI/testes) | 5% | **3,4** | 784 testes, 4 guardas, build verde; `ci.yml` passa verde sem segredo, sem cobertura |
| 10 | Produto e UX | 3% | **3,0** | Central de comando e abas completas; arquivos de 1.600 linhas; QA sem massa de teste |
| 11 | Integrações e interoperabilidade | 2% | **2,0** | MCP próprio, GitHub, storage; sem P6/XER, MS Project, IFC/BIM, ERP |

**Nota ponderada: 3,2 / 5.**

### Escala de nível

| Nível | Definição | Arquimedes |
|---|---|---|
| N1 | Prova de conceito | — |
| N2 | Ferramenta de uso interno | — |
| N3 | Sistema em produção, com dados e usuários reais | **aqui (3,2)** |
| N4 | Plataforma confiável e mensurável | meta em ~6 meses |
| N5 | Copiloto de engenharia auditável | meta em ~10 meses |
| N6 | Autônomo supervisionado | não recomendado antes do N5 |

O padrão da nota é revelador: **as duas maiores notas estão no núcleo de engenharia
(4,0 e 4,2) e as três menores estão em operação (2,0, 2,1, 2,4)**. O produto está
mais pronto do que a operação que o sustenta. É exatamente o inverso do que acontece
em concorrentes de mercado, e é uma boa posição: o difícil (domínio) já foi feito; o
que falta é engenharia de confiabilidade, que é previsível.

---

## 5. O que precisa melhorar

### P0 — Confiança (sem isso, crescer amplifica risco)

1. **Observabilidade de verdade.** Não existe Sentry/OpenTelemetry, alerta de 5xx,
   painel nem SLO. O `/healthz` prova que o processo subiu, não que ele funciona.
   *Evidência:* nenhuma dependência de monitoramento; 5 falhas de agente sem alerta.
2. **Avaliação do agente.** Há tracing (2.537 eventos), mas nenhum conjunto de casos
   com resposta esperada. Toda mudança de prompt é fé. *Evidência:* `agent_runs` sem
   tokens/custo/duração por ferramenta; 56 memórias em `proposed` sem ciclo de
   fechamento; categorias duplicadas (`eap_review` e `eap_revisao`).
3. **CI que não passa verde sem testar.** O `ci.yml` aceita `SUPABASE_DB_URL` ausente
   e segue verde — a mesma armadilha já corrigida no workflow da Aurora.
4. **Integridade residual.** 35 atividades com `versionId` nulo em obras mortas;
   31 FKs sem índice de cobertura. Baixo impacto hoje, dívida crescente.
5. **Ambiente de QA vazio.** `ARQUIMEDES-QA` tem 0 nós, 0 atividades, 0 baselines.
   Não há onde validar mudança antes da produção.
6. **Backup e restauração testados.** Existe retenção de lixeira; não há evidência de
   ensaio de restore. Sem isso, o resto é confiança emprestada.

### P1 — Cronograma de classe profissional

7. **Calendários dentro do motor CPM** (não só na borda), com exceções e feriados.
8. **Data date, actuals e reprojeção** — o cronograma precisa aceitar o que já
   aconteceu, não só o plano.
9. **Histograma e nivelamento de recursos** — hoje não há noção de equipe/frente
   saturando o cronograma.
10. **Baseline × realizado e EVM** (PV/EV/AC, SPI/CPI), com curva S.
11. **Import/export P6 (XER/XML) e MS Project (XML)** — sem isso, o engenheiro não
    entra nem sai do Arquimedes em obra que já usa P6.

### P2 — Fechar o laço de produto

12. **Quantidade da EAP → composição → custo** de forma explícita e auditável.
13. **Medição e LOB nativos**, hoje dependentes de MCP externo não versionado neste
    repositório — risco de disponibilidade e de deriva de contrato.
14. **Documentos com citação** (RAG sobre projeto, contrato, diário) com referência
    à página/cláusula, como Trunk Tools e Document Crunch fazem.
15. **Portões de aprovação para toda mutação do agente** (hoje a EAP tem; orçamento e
    cronograma precisam do mesmo padrão).
16. **Quebrar `routers.ts` (6.451 linhas) e `orchestrator.ts` (2.442)** em módulos por
    domínio, com contrato testado — não por estética, por velocidade de mudança.

### P3 — Diferenciação (só depois de P0/P1)

17. Monte Carlo sobre o CPM (risco de prazo com probabilidade, não data única).
18. Otimização generativa de alternativas (classe ALICE), usando o CPM determinístico
    como juiz.
19. 4D/BIM (IFC) e progresso por foto/360 (classe Buildots/OpenSpace).
20. Previsão por histórico de cronogramas (classe nPlan) usando as obras já planejadas.

### Fora de escopo (decidido)

- Não competir em amplitude com Procore (RFI, compras, ERP).
- Não reescrever o sistema "big bang".
- Não ligar RLS antes do caminho de acesso estar provado (decisão do Rafael; a guarda
  de acesso por procedure é o controle compensatório atual).
- Não adicionar multiagente decorativo.

---

## 6. Roadmap

Cada fase tem critério de saída objetivo. Nenhuma fase começa sem a anterior verde.

### Fase 0 — Fundação de confiança (2 semanas)

| Entrega | Critério de saída |
|---|---|
| Sentry (ou equivalente) + alerta de 5xx e de falha de agente | Uma falha provocada gera alerta em <5 min |
| `ci.yml` exige segredo e falha alto | Remover a variável deixa o job vermelho |
| Painel de saúde do agente (runs, falhas, latência, iterações) | Números de hoje visíveis sem SQL manual |
| Custo/tokens por execução registrados | Custo médio por run conhecido |
| Conjunto de avaliação v1 (10 casos: EAP, CPM, orçamento, recusa) | Rodada automática no CI com nota |
| QA com uma obra espelho da Aurora | QA reproduz o fluxo completo |
| 35 `versionId` nulos corrigidos; 31 FKs indexadas | Consultas de integridade em zero |
| Ensaio de restore documentado | Restaurar backup em ambiente isolado |

**Saída:** nota de operação sobe de 2,0 para 3,0; N3 consolidado.

### Fase 1 — Cronograma classe P6 (6 a 8 semanas)

Calendários no motor, data date/actuals, histograma e nivelamento, baseline×realizado,
EVM/curva S, import/export P6 e MS Project. Testes de propriedade sobre o CPM
(nenhuma atividade com data fora do calendário; nenhuma folga negativa sem explicação).

**Saída:** um cronograma de obra real importado do P6, recalculado e exportado sem
perda relevante. Nota de cronograma: 3,0 → 4,2.

### Fase 2 — Orçamento, medição e LOB fechados (6 semanas)

Quantidade EAP→composição, medição física-financeira, LOB nativo com balanceamento de
ritmo, curva S financeira, aprovação de orçamento e de medição com o mesmo porte da EAP.

**Saída:** uma obra consegue ir de EAP a medição do mês sem planilha paralela.
Nota de orçamento/medição: 2,4 → 3,8.

### Fase 3 — Agente de produção (8 semanas)

Avaliação contínua (conjunto dourado por domínio), tracing com custo e duração por
ferramenta, memória com ciclo formal (proposta → aprovada → aplicada → medida),
RAG de documentos com citação, portões de aprovação para mutações, quebra do
orquestrador em módulos e orçamento de iterações adaptativo (hoje o teto de 8 já foi
atingido).

**Saída:** taxa de acerto no conjunto dourado ≥85%, custo por tarefa dentro do
orçamento, toda mutação rastreável a uma aprovação. Nota de agente: 3,6 → 4,2;
operação: 2,1 → 3,5.

### Fase 4 — Escala e governança (contínuo, a partir do mês 6)

RLS em modo sombra e depois enforce (quando autorizado), SSO, trilha de auditoria,
SLOs e alertas por SLO, rotação de segredos, política de retenção, multi-tenant.
Esta fase é a porta do N5.

### Fase 5 — Diferenciação (mês 8+)

Monte Carlo, otimização generativa de alternativas, IFC/4D, progresso por imagem,
previsão por histórico. Só faz sentido depois que o N4 estiver provado — antes disso,
é funcionalidade sem confiança.

### Cronograma-resumo

| Mês | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Fase 0 | ██ | | | | | | | | | |
| Fase 1 | | ██ | ██ | | | | | | | |
| Fase 2 | | | | ██ | ██ | | | | | |
| Fase 3 | | | | | | ██ | ██ | ██ | | |
| Fase 4 | | | | | | | | | ██ | ██ |
| Fase 5 | | | | | | | | | | ██ |

---

## 7. Como medir a evolução (scorecard)

Reavaliar a cada fase, com os mesmos critérios. Metas:

| Indicador | Hoje | N4 | N5 |
|---|---|---|---|
| Nota de maturidade | 3,2 | 4,2 | 4,7 |
| Cobertura de testes | 0% | 60% | 75% |
| Falhas de agente | 4,3% | <1,5% | <0,5% |
| Acerto no conjunto dourado | não medido | ≥85% | ≥95% |
| Custo médio por execução | não medido | orçado e monitorado | otimizado |
| Latência p95 | 84,6 s (máx.) | <60 s | <30 s |
| Obras com cronograma íntegro | 3/3 | 3/3 | 3/3 |
| Procedures com guarda de acesso | 100% | 100% | 100% |
| Tabelas com RLS | 0 | 0 (decisão) | 100% |
| Alertas acionáveis | 0 | 5 | 10 |
| Interoperabilidade | 0 | P6 + MS Project | + IFC |

---

## 8. Riscos e decisões pendentes

| Risco | Impacto | Mitigação |
|---|---|---|
| Dependência de 3 MCPs externos (EAP, cronograma, Gantt/LOB) não versionados aqui | Médio-alto | Contrato versionado + testes de contrato + fallback nativo (Fase 2) |
| `routers.ts` de 6.451 linhas | Médio | Quebra modular na Fase 3, com testes de contrato antes |
| Sem avaliação do agente | Alto | Conjunto dourado na Fase 0 |
| Sem observabilidade | Alto | Sentry + alertas na Fase 0 |
| RLS adiada por decisão | Médio | Guarda de acesso já testada; plano sombra→enforce na Fase 4 |
| Rotação de senha/`sbp_` adiada | Médio | Executar na janela da Fase 4, com checklist |
| Obras mortas com dados legados | Baixo | Corrigir os 35 `versionId` na Fase 0 |
| QA sem massa | Médio | Obra espelho na Fase 0 |

Decisões que dependem do Rafael (não tomadas neste estudo): momento do RLS, rotação
de credenciais, apetite para importar P6 antes do export, e se a Fase 3 acontece em
paralelo com a 2.

---

## 9. Conclusão

O Arquimedes já venceu a parte difícil: **transformou engenharia de planejamento em
regras executáveis e deu ao agente ferramentas determinísticas para não inventar**.
Isso é raro no mercado — a maioria dos "agentes de obra" responde texto sobre
documento e não tem juiz.

O que falta é a parte previsível: **medir, alertar, avaliar e governar**. Por isso a
nota 3,2 não é uma crítica ao produto; é o retrato de um sistema que cresceu mais
rápido na engenharia do que na operação. O caminho para o N4 não exige novas ideias,
exige disciplina: 2 semanas de fundação, 8 de cronograma, 6 de orçamento/medição e 8
de agente — cerca de 6 meses para chegar a **4,2/5**, com cada afirmação do sistema
rastreável e cada falha visível.

A frase que deve guiar o produto daqui para frente:

> **O Arquimedes não precisa saber mais. Precisa provar o que já sabe.**

---

## Apêndice A — Como reproduzir as medições

```sql
-- integridade
select count(*) from schedule_activities a
  join project_plan_versions v on v.id = a."versionId"
 where v."projectId" <> a."projectId";                     -- 0
select count(*) from schedule_activities where "versionId" is null;  -- 35 (obras mortas)
select "projectId", count(*) from project_plan_versions
 where status = 'approved' group by 1 having count(*) > 1; -- 0

-- agente
select count(*), avg(iterations), max(iterations) from agent_runs;
select "eventType", count(*) from agent_run_events group by 1 order by 2 desc;
select category, status, count(*) from agent_memories group by 1,2 order by 3 desc;
```

```bash
# código
git rev-parse --short HEAD
pnpm test
pnpm build
npx tsc --noEmit
```

## Apêndice B — Referências de mercado

Oracle Primavera P6 · Microsoft Project · Elecosoft Asta Powerproject · ALICE
Technologies · nPlan · Procore · Autodesk Construction Cloud · Trimble Viewpoint ·
CMiC · Buildertrend · CostOS · Candy (CCS) · Sage Estimating · Togal.AI · Kreo ·
Trunk Tools · Document Crunch · Buildots · OpenSpace · Doxel · Synchro · Navisworks ·
OpenAI Agents SDK · Claude Agent SDK/MCP · LangGraph/LangSmith · CrewAI · AutoGen.

*Estudo produzido em 16/10/2026 sobre o commit `ec0aa21`, sem alteração de código de
produção.*
