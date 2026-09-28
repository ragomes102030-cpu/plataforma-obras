# Plano de Expansão do Módulo de Planejamento e Controle

> Status: proposta para discussão — nada aqui foi implementado ainda.
> Base: auditoria do código em `develop` @ `0787455`, 31 tabelas, 4.722 linhas em `server/routers.ts`.
> Origem: pedido explícito por cobertura de escopo além do roteiro do livro *Planejamento e Controle de Obras* (Aldo Dórea Mattos).

---

## 1. O diagnóstico: onde o livro termina

O sistema está tecnicamente saudável e conceitualmente incompleto. Não é problema de qualidade de código — é problema de **fronteira de escopo**.

O Mattos entrega um bloco coberto de forma competente: CPM com FS/SS/FF/SF, defasagem, data de início, linha de balanço por unidades repetitivas, medição, verificação. O sistema implementa esse bloco, com testes de verdade e matemática correta (`shared/cpm.ts`, 8 testes).

O que o Mattos **não** cobre, e que é a metade que efetivamente paga a obra numa construtora, está ausente. A frase que resume a lacuna:

> Hoje o sistema **prevê**. Ele não **controla**, não **custa em reais reais**, não **medi risco**, não **considera recurso**, e não **mede o próprio planejamento** contra a realidade.

Consequência prática: qualquer data que a tela mostra está errada (não há calendário), o custo real é uma estimativa (o AC do EVM usa preço *planejado*), e a linha de base é escrita mas nunca comparada. Um cliente que peça "quanto atraso tenho e quanto custou" recebe número inventado com alta confiança. Isso é o pior tipo de bug: silencioso.

### A régua de qualidade do que vem a seguir

Toda onda deste plano édvida por um teste de verdade:

> "Se um engenheiro de obra pegasse este número, ele assinaria embaixo?"

Nenhuma feature entra em produção sem (a) teste unitário do cálculo, (b) fonte do dado rastreável até a tabela de origem, (c) indicação explícita quando o número é *estimado* e não *medido*.

---

## 2. Frameworks de referência

O escopo de "planejamento de obras" não é um método, é a interseção de quatro Families. Nenhuma sozinha cobre tudo — por isso o sistema hoje parece completo e não é.

| Framework | O que traz que o Mattos não traz | Onda |
|---|---|---|
| **PMBOK 8** (PMI, nov/2025) — 7 domínios de desempenho: *governança, escopo, cronograma, finanças, partes interessadas, recursos, risco* | Enquadramento de governança, **partes interessadas**, **comunicação**, integração, e o domínio *riscos* como primeira classe | 4, 6, 7 |
| **PMBOK 6** (10 áreas de conhecimento) | WBS/OBS codificado, matriz RACI, plano de comunicação, registro de riscos, plano de respostas a mudanças | 3, 4, 6 |
| **AACE International** — TCM Framework, 120+ *Recommended Practices*, ANSI-accredited | Classes de estimativa de custo (Class 0 a 5, ±%), classe de precisão de cronograma, **Recommended Practices de control** (baseline, EVM, change control, claim) | 1, 5 |
| **Lean Construction / LPS** (LCI) — 5 conversas conectadas: *Master Planning, Look Ahead, Weekly Planning, Daily Interaction*, PPC, *Pulled Ahead* | **LPS/PPC** (medição de confiabilidade do plano), *lookahead* de 2–4 semanas, plano de trabalho semanal, gestão de restrição | 6, 7 |
| **PMI (EVM)** | Earned Value real, Earned Schedule, forecasts ETC/EAC/VAC | 1, 5 |
| **NEC / melhores práticas de cronograma de obra** | Data de status (*data date*), atualização em dois pontos, *progress measurement cycle*, *look-ahead schedule* | 0, 1 |
| **CPM clássico (PERT / redes de precedência)** | **Análise de todos os caminhos** — caminho crítico, caminhos quase-críticos, caminho de maior flutuação, sensibilidade | 0 |
| **BIM 4D/5D** | Modelos e objetos vinculados (*linked*), quantitativos por local, *CDE* (ambiente de dados comum) | 2, 6 |

---

## 3. Matriz de lacunas (evidência do código)

Cada linha foi verificada no código. A coluna "Impacto" diz o que quebra se não for tratada.

| # | Lacuna | Evidência | Impacto |
|---|---|---|---|
| G1 | **Sem calendário, sem feriados, sem tempo de trabalho** | `shared/cpm.ts:31` — *"não consulta relógio, banco ou rede"*; passe direto com `start = 0` (`cpm.ts:95`); tela avisa *"dias corridos, sem feriados"* (`GanttView.tsx:233`) | **Todas as datas estão erradas.** Feriado, chuva, sábado de equipe bia: tudo contado como dia útil |
| G2 | **`startOffset` em vez de datas** | `schedule_activities.startOffset int` (`schema.ts:246`) | Não dá data real, não dá data de status, não dá re-baseline |
| G3 | **Sem folga livre / interferência** | `shared/cpm.ts:15-22` só tem `totalFloat`; sem `freeFloat` | Não sabe quais atividades podem escorregar *sem* bater no caminho crítico. Balanceamento de ritmo fica no escuro |
| G4 | **Sem análise de caminhos (caminho dos 100%)** | `critical = totalFloat <= 0` (`cpm.ts:150`); só existe `criticalPath[]` | Um caminho só não diz se a rede é frágil. Sem caminho de flutuação máxima / quase-críticos, não se mede a robustez da rede |
| G5 | **Linha de base é escrita e nunca lida** | `planning.captureBaseline` grava (`routers.ts:3042`); **nenhuma procedimento lê para diff** | **Variance de início/prazo/flutuação é matematicamente incalculável** — `schedule_baseline_items` (`schema.ts:391-406`) nem guarda LS/LF/TF nem snapshot de progresso |
| G6 | **AC do EVM não é custo real** | `routers.ts:3440` — `ac += actualQuantity * (unitPrice/quantity)` = quantidade real × **preço planejado**. Sem tabela de custo real/commitment | CPI/CV/EAC medem **quantidade**, não custo. O próprio código admite em `routers.ts:3462` |
| G7 | **Sem data de status nem duração restante** | Sem `dataDate`, `actualStart/Finish`, `remainingDuration` em `schedule_activities` | Não dá para rodar CPM de hoje, nem re-baseline de 2 pontos. `planning.updateActivities` reescreve o plano aprovado no lugar |
| G8 | **Sem restrição (SNET/MSO/MFO/LAG)** | grep `SNET\|MSO\|MFO` → 0 hits | Não dá para fixar datas de fato (fundação pronta em tal data, entrega de material) |
| G9 | **CPM ignorado de recursos** | `calculateCpm(activity, deps)` nunca lê `planning_resources`; `planning.leveling` (`routers.ts:3562`) é só um histograma diário de demanda, e `applyLevelShift` só empurra dentro da flutuação | O caminho crítico é **irrestrito** — errado em qualquer obra com equipe limitada |
| G10 | **EAP não faz rollup nem sequenciamento** | `planning.generateFromEap` (`routers.ts:3123`) cria 1 atividade por nó `entrega`, todas `startOffset:0`, `duration = plannedQuantity` (`:3160`) | 500 nós viram 60 barras paralelas idênticas. EAP é um organograma, não um plano |
| G11 | **Sem registro de riscos, sem contingência** | 31 tabelas, zero de risco. Só `"Em risco"` como enum (`schema.ts:39`). `agent_findings` é quality gate de IA, sem dono/reserva | Domínio de risco do PMBOK inteiro ausente |
| G12 | **Sem suprimento/contrato/medição financeira** | zero tabelas; `MedicaoView.tsx:20` anota *"depende da decisão D2"* (D1/D2 em `docs/analise-planilhas/regras-conflitantes.md`) | Fluxoorcamento→contrato→medição→pagamento quebrado |
| G13 | **Sem local/pavimento; LOB só no cliente** | `production_units` **sem campo de sequência** (`schema.ts:436-446`); sem `planning.lob` no router; LOB desenhada em SVG no browser | Linha de balanço real (tempo × pavimento) **não é computável no servidor** |
| G14 | **Auditoria quase vazia** | `project_audit_events` com 3 inserts (`routers.ts:1485, 2530, 2616`). Sem log de CPM, baseline, edição, medição, aprovação, transição de portão | Fluxo de aprovação não é auditável |
| G15 | **Zero teste nos números que o usuário vê** | `planning.evm/scurve/control/leveling`, `captureBaseline`, `confirmEntry` sem teste. `vitest.config.ts:17` só `server/**` e `shared/**`; cliente nunca testado | Confiança zero nos indicadores |
| G16 | **Migrações Drizzle nunca aplicadas** | 22 arquivos `drizzle/00NN_*.sql`; pre-deploy só roda `bootstrap-db.mjs` (log: *"banco já inicializado; nada a fazer"*) | **Estamos prestes a adicionar ~15 tabelas.** Sem migração real, cada onda é uma bomba |
| G17 | **Sem partes interessadas, comunicação, documentos** | grep `stakeholder\|interessado\|transmittal` → 0 hits. Só `RestrictionsView` (texto curto) | PMBOK 6parties/Communications ausente |

**Nota de qualidade (contraweight honesto):** o motor CPM é correto, determinístico e testado; a lógica de mover nós da EAP trata a colisão do índice único corretamente; a regra de cobertura de custo 100% é disciplina real de PMBOK; o matching de preço recusa auto-link (decisão que a maioria erra); preview-then-apply e os 10 portões com gate de cobertura de custo é governança de verdade; os testes estáticos de access-guard e error-codes são melhores que a maioria dos projetos. O problema é o **modelo parar exatamente onde planejamento de obra fica difícil**.

---

## 4. Ondas

Ordenadas por dependência, não por "interessante" ou por esforço.
interessante" ou esforço. Cada onda é mergeável e não quebra a anterior.

### Onda 0 — Pilares: migração + calendário + caminho dos 100%

**Motivo de vir primeiro:** G1 e G16 invalidam tudo. Datas erradas em cima de migração quebrada = lixo acumulado. Enquanto G1 estiver aberto, qualquer número de prazo que a gente construa em cima vai precisar ser refeito.

**Entregas**
1. **Pipeline de migração real.** `drizzle-kit migrate` no pre-deploy, removendo `full-schema.sql` como fonte. Matar `ensureUsersTable`/`ensurePlanVersionSchema` (`_core/index.ts:105,153`) depois que a migração passar. *(G16)*
2. **Calendário de trabalho.** Tabela `work_calendars` (tipo: BR-nacional, 5×2, 6×1, custom) + `calendar_exceptions` (feriados, ponto facultativo, dias de chuva). Datas reais em `schedule_activities` (`plannedStart/plannedFinish`, `actualStart/actualFinish`), migração de `startOffset` → data usando o calendário padrão. *(G1, G2)*
3. **CPM ciente de calendário** e `dataDate` (data de status) — passe direto a partir da data de status, não de `start=0`. *(G1, G2)*
4. **Folga livre (FF) e de interferência (IF)** no resultado, além da total. *(G3)*
5. **Análise de caminhos / caminho dos 100%.** Enumerar caminhos de alto *float* e quase-críticos, com **classe de flutuação** por atividade, e uma visão "robustez da rede". Também cobre a **linha de balanço por frentes** com reta de ritmo e **risco de interferência** (equipe rápida esperando a de trás). *(G4)*
6. **Restrições** SNET/MSO/MFO/LAG. *(G8)*
7. Testes: calendário, calendário+bypass de feriado, folga livre, caminho dos 100%, restrição. Fixar a definição de "caminho dos 100%" com o usuário ANTES de codar (ver §5).

**Fora desta onda (de propósito):** recursos. Comentário de recurso custa mais que o cálculo de prazo, e o CPM ciente de recurso sem calendário é lixo duas vezes.

---

### Onda 1 — Linha de base e controle de variação

**Entregas**
1. **Completar `schedule_baseline_items`**: LS/LF/TF, datas reais, snapshot de progresso, `dataDate` da baseline. **Portão: sem isso a variância é incalculável, não só não-calculada.** *(G5)*
2. **`planning.compareBaseline`**: desvio de início, desvio de duração, desvio de progresso, desvio de flutuação, por atividade e por frente. Este é o entregável que o cliente paga.
3. **Re-baseline de 2 pontos** (status→previsão) com justificativa, e trilha de baseline (quem, quando, por quê).
4. **Curva S de trabalho** por atividade com distribuição planejada (não só % linear) — linha de base de S por serviço.
5. **Fix do custo real**: tabela `actual_costs` (por atividade/frente, custo, data, fonte). Fim do AC inventado. Curva de custo PV/EV/AC. *(G6 — resolve metade, ver Onda 5)*
6. **Índices EVM reais** + **Earned Schedule (ES/AT)**. *(G6)*
7. Trilha de auditoria nos pontos de controle: CPM, baseline, aprovação, medição, transição de portão. *(G14)*
8. Testes de `control/evm/scurve/compareBaseline` — hoje zero. *(G15)*

**Critério de pronto:** dá para responder "quanto atraso, quanto custou a mais, e em que frente" com dado de origem, e a curva S bate com a linha de base.

---

### Onda 2 — Local / pavimento + Linha de Balanço de verdade

**Entregas**
1. **`production_units` com `sequence`** — sem isso nada de LOB é computável. *(G13)*
2. **Modelo atividade × local**: `schedule_activities.locationId`/`pavimento` + carga por unidade.
3. **`planning.lob` no servidor**: linha de balanço (tempo × pavimento) com uma reta por serviço, ritmo por unidade, detecção de *risco de interferência*.
4. Balanceamento de ritmo → alterar nº de equipes por atividade e recalcular.
5. Tela de LOB no servidor (hoje é SVG no cliente).

**Critério de pronto:** "onde a equipe A está" e "quantos dias de atraso a frente X soma na linha Y" saem do banco, com sequência real.

---

### Onda 3 — Recursos e carga de custo

**Entregas**
1. **Calendário de recurso** (equipe não trabalha todo dia).
2. **Carga de custo por recurso** (`costPerDay` existe em `planning_resources` mas não é consumido no CPM nem na curva).
3. **CPM com restrição de recurso** (heurística de nível, tipo RCG/RCRS) — hoje `calculateCpm` nunca vê recursos. *(G9)*
4. **Curva de manpower** (S de equipe, pico, ociosidade).

**Critério de pronto:** "são 3 equipes ou 5?" responde com simulação que muda o caminho crítico.

---

### Onda 4 — Risco e contingência

**Entregas**
1. **Registro de riscos** com ID, descrição, categoria, causa-efeito, **responsável**, probabilidade × impacto (5×5), escore, gatilho, resposta, status. Registro próprio, separado de `agent_findings`.
2. **Reserva de contingência** (custo) e **reserva de prazo** (schedule risk), com dono.
3. **Quantificação**: PERT (3 pontos) e Monte Carlo simples sobre o caminho crítico → probabilidade de prazo, P50/P80.
4. **Integração risco → prazo e → custo**: a resposta ao risco altera a duração da atividade e o AC.

**Critério de pronto:** um risco de chuva entra como prob×impacto, vira dias de folga somewhere e aparece no P80 da curva S.

---

### Onda 5 — Custo real, contratos e suprimento

**Entregas**
1. **Medição financeira**: fechar D1 (data-base) e D2 (granularidade) de `docs/analise-planilhas/regras-conflitantes.md`. *(G12)*
2. **Contratos e fornecedores**: cadastro, marcos de medição, parcelas, medições, fluxo de caixa.
3. **Custo real por pacote** alimentando o EVM de verdade. *(G6 fecha aqui)*
4. Compra/estoque ligado a suprimento (se o escopo incluir).

**Nota:** G12 é a maior dependência externa — depende de D1/D2 e talvez de contrato com o cliente. Pode correr em paralelo à Onda 3, mas é a que mais precisa de decisão sua.

---

### Onda 6 — Governança, LPS e partes interessadas

**Entregas**
1. **LPS / PPC**: *master planning*, *lookahead* (2–4 semanas), plano de trabalho semanal, PPC medido, *pulled ahead*. O sistema já tem `production_teams`/`production_units`/`production_entries` — é a base certa. *(LCI)*
2. **Partes interessadas**: registro, poder/interesse, estratégia de engajamento. **Matriz RACI** por pacote. *(PMBOK 6)*
3. **Comunicação e documentos**: registro de documentos, revisão de desenho, *transmittal*, ata de reunião, *RFI*, mudança formal.
4. **Plano de resposta a mudanças** integrado ao versionamento de plano.
5. **Gestão documental / CDE** se houver BIM (Orbit para linkages 4D).

**Critério de pronto:** dá para medir a confiabilidade do próprio plano (PPC) e gestionar quem decide o quê.

---

## 5. Decisões que preciso de você antes de codar

1. **Definição de "caminho dos 100%".** Minha leitura: o caminho de **maior flutuação total** da rede (o mais "folgado"), usado para medir a robustez/liberdade da rede, junto com os caminhos **quase-críticos** (TF ≤ tolerância). Confirma? Ou o seu uso é outro (ex.: uma *classe* de flutuação)? Preciso saber porque isso define o que o motor calcula e o que a tela mostra.
2. **Escopo do Onda 5** (contratos/medição): entra agora ou depois? Depende de D1/D2 e de compromisso com cliente.
3. **Escopo do Onda 6** (LPS/PPC, partes interessadas, documentos): é o seu dia-a-dia de campo, ou quer evitar? LPS muda a forma como a equipe usa o sistema.
4. **Prioridade entre Onda 3 (recursos) e Onda 4 (risco)** se não der para fazer as duas: o que dói mais hoje no seu uso?
5. **`railway.json` vs RAILPACK.** O repo está com config duplicada e o Railway avisa: *Config as Code sai em 2026-12-01*. Como estamos adicionando ~15 tabelas, não dá para deixar o pre-deploy indefinido. Migramos para `.railway/railway.ts` nesta onda, ou só no fim?

---

## 6. Como medimos o progresso

- **Onda 0:** `readyz` passa a checar migração aplicada; CPM de uma rede com feriado retorna data de término correta; um caso de teste fixando a definição do caminho dos 100%.
- **Onda 1:** uma resposta a "quanto atraso e quanto custou" com dado de origem, e a curva S vs linha de base com diferença explicada.
- **Onda 2:** LOB de um prédio de 8 pavimentos com unidades em sequência real.
- **Onda 3:** "3 equipes ou 5?" muda o caminho crítico de forma explicada.
- **Onda 4:** um cenário de chuva com P50/P80 e contingência visível na curva S.
- **Onda 5/6:** dependem das decisões §5.

Regra transversal em todas as ondas: **zero feature sem teste do cálculo** (G15). A onda 0 já cria a saudável; a partir daí o padrão é "todo número novo nasce com teste".

---

## 7. Ordem sugerida (se aprovar)

```
Onda 0  Fundação (calendário + caminho dos 100% + migração)   ← desbloqueia tudo
Onda 1  Linha de base + variação + EVM real                     ← o cliente paga aqui
Onda 2  Local/pavimento + LOB de verdade
Onda 3  Recursos (3 equipes ou 5?)
Onda 4  Risco + contingência
Onda 5  Contratos + medição financeira (depende de D1/D2)
Onda 6  LPS/PPC + partes interessadas + comunicação
```

**Recomendação:** começar pela Onda 0 inteira, não só pelo calendário. É tentador pular direto para o "caminho dos 100%" (é a sua dor), mas o calendário é o que invalida todas as datas — e o caminho dos 100% só faz sentido em cima de datas que prestam.
