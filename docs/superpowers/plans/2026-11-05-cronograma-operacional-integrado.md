# Cronograma Operacional Integrado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um cronograma operacional didático que preserve as 30 atividades da Escola, sincronize grade, Gantt, rede, baseline, produção e locais, e transforme cada bloqueio em uma orientação concreta de resolução.

**Architecture:** A identidade operacional passa a ser `activityId`; WBS permanece agrupamento. Um contrato puro de orientação descreve bloqueios e alimenta componentes reutilizáveis. A aba Cronograma compõe grade, tempo e inspetor sobre os endpoints existentes, mantendo CPM e baseline como fontes oficiais e sem criar datas paralelas.

**Tech Stack:** React 19, TypeScript, tRPC, Drizzle/PostgreSQL, Vitest, CSS existente, Lucide React.

**Spec:** `docs/superpowers/specs/2026-11-05-cronograma-operacional-integrado-design.md`

## Global Constraints

- `activityId` identifica atividade, seleção, produção e dependência; `wbsCode` somente agrupa.
- Baseline é snapshot congelado e CPM persistido é a fonte das datas oficiais.
- Ausência de produção é “Sem dado”, nunca 0% executado.
- Avanço físico agregado exige pesos físicos explícitos e aprovados pelo engenheiro.
- Orçamento aprovado é base do EVM, não peso físico implícito.
- Todo bloqueio informa fato, consequência, passos, destino de correção, evidência de resolução e dados preservados.
- Uma etapa bloqueada não oferece ação de avanço; a ação principal é “Resolver pendência”.
- Não criar quantitativos, produtividade, responsáveis, locais ou custos para completar a interface.
- Preservar rotas e abas técnicas durante a validação do novo Cronograma.
- Validar ao vivo somente na Escola; nenhuma escrita em outras obras.

## Review Focus

- Duas atividades com o mesmo WBS continuam distintas na grade, Gantt, seleção e vínculos — coberto na Task 1.
- Produção histórica por WBS ambíguo não é duplicada entre atividades — coberto na Task 1.
- Bloqueio combinado (EAP + duração + rede) mostra ordem de resolução e uma única ação primária — coberto na Task 2.
- Baseline sem datas, ausência de produção e orçamento didático permanecem estados independentes — coberto nas Tasks 4 e 5.
- 500/2.000 atividades não congelam seleção, filtro ou rolagem — coberto na Task 6.

---

### Task 1: Identidade operacional por atividade

**Files:**
- Modify: `shared/cronograma-colunas.ts`
- Modify: `shared/gantt-arvore.ts`
- Modify: `server/routers.ts:4678-4740`
- Modify: `client/src/pages/Home.tsx:535-555`
- Modify: `client/src/components/VisualizacaoPlanejamento.tsx`
- Test: `shared/gantt-arvore.test.ts`
- Test: `server/grade-identidade-atividade.test.ts`
- Test: `client/src/components/gantt-identidade-atividade.test.ts`

**Interfaces:**
- Produces: `EntradaDaLinha.activityId: number`; `NoDoGantt.activityId: number | null`; chaves folha `atividade:<id>`; chaves grupo `eap:<codigo>`.
- Produces: `planning.grade.linhas[]` com o ID originado na mesma atividade, sem `find` por WBS.
- Consumes: `scheduleActivities.id`, `scheduleActivities.wbsCode`, produção confirmada até a data de posição.

- [ ] **Step 1: Escrever testes falhos para WBS repetido**

Criar casos com 3 atividades (`id` 101, 102, 103), duas no WBS `1.8.1`. Afirmar que `montarArvore` retorna 3 folhas com chaves distintas, mantém os 3 nomes e permite selecionar a atividade 102 sem selecionar 101.

- [ ] **Step 2: Escrever teste de integração falho do `planning.grade`**

No PGlite, inserir 2 atividades do mesmo WBS e afirmar que `linhas.map(l => l.activityId)` contém os 2 IDs exatos. Inserir produção no ID atual e afirmar que ela aparece somente nessa linha.

- [ ] **Step 3: Fixar produção histórica ambígua**

Adicionar teste com lançamento de versão antiga cujo WBS corresponde a 2 atividades atuais. Afirmar que o lançamento entra em `producaoSemAlocacao` e não é duplicado nas duas linhas. Para WBS com uma única atividade atual, manter o fallback histórico.

- [ ] **Step 4: Executar testes para confirmar falha**

Run: `pnpm exec vitest run shared/gantt-arvore.test.ts server/grade-identidade-atividade.test.ts client/src/components/gantt-identidade-atividade.test.ts`

Expected: FAIL por ausência de `activityId` estável e colapso do WBS repetido.

- [ ] **Step 5: Implementar o contrato de identidade**

Adicionar `activityId` a `EntradaDaLinha`; construir `entradas` no router já com o ID; remover `activities.find(a => a.wbsCode === l.codigo)`; devolver `producaoSemAlocacao: Array<{ wbsCode: string; quantity: number }>`; adaptar árvore, dependências, seleção, baseline e detalhes para usar ID.

- [ ] **Step 6: Atualizar fixtures tipadas**

Adicionar IDs determinísticos aos testes e fixtures de cronograma/LOB sem alterar regras de data, quantidade ou localização.

- [ ] **Step 7: Executar testes e tipagem**

Run: `pnpm exec vitest run shared/gantt-arvore.test.ts server/grade-identidade-atividade.test.ts client/src/components/gantt-identidade-atividade.test.ts shared/cronograma-colunas.test.ts client/src/components/linha-balanco-modelo.test.ts && pnpm check`

Expected: PASS; 30 atividades da Escola não se reduzem a 27 identidades.

- [ ] **Step 8: Commit**

```bash
git add shared/cronograma-colunas.ts shared/gantt-arvore.ts server/routers.ts client/src/pages/Home.tsx client/src/components/VisualizacaoPlanejamento.tsx shared/gantt-arvore.test.ts server/grade-identidade-atividade.test.ts client/src/components/gantt-identidade-atividade.test.ts
git commit -m "fix: preserve activity identity across schedule views"
```

### Task 2: Orientação didática para bloqueios

**Files:**
- Create: `shared/planning-guidance.ts`
- Create: `shared/planning-guidance.test.ts`
- Create: `client/src/components/OrientacaoDeEtapa.tsx`
- Create: `client/src/components/orientacao-etapa.test.tsx`
- Modify: `shared/proximo-passo-planejamento.ts`
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/planilha.css`

**Interfaces:**
- Produces: `type OrientacaoDeBloqueio = { id; severidade; titulo; oQueAconteceu; porQueBloqueia; passos: string[]; abaDestino; rotuloAcao; evidenciaDeResolucao; dadosPreservados?; detalhesTecnicos? }`.
- Produces: `orientarFluxoPlanejamento(input): { bloqueado: boolean; primaria: OrientacaoDeBloqueio | null; demais: OrientacaoDeBloqueio[] }`.
- Consumes: estados já usados por `proximoPassoPlanejamento`, sem consultas novas.

- [ ] **Step 1: Escrever testes falhos do contrato didático**

Cobrir EAP não aprovada, duração inválida, rede vazia/inválida, CPM desatualizado, baseline ausente e múltiplos bloqueios. Afirmar ordem EAP → atividades → dependências → CPM → baseline e presença dos 6 campos didáticos.

- [ ] **Step 2: Executar teste para confirmar falha**

Run: `pnpm exec vitest run shared/planning-guidance.test.ts`

Expected: FAIL porque `orientarFluxoPlanejamento` não existe.

- [ ] **Step 3: Implementar `orientarFluxoPlanejamento`**

Usar dados determinísticos; não interpretar texto de erros. `detalhesTecnicos` pode conter IDs/códigos, mas nunca substituir a explicação humana.

- [ ] **Step 4: Escrever teste falho do componente**

Renderizar bloqueio de rede; afirmar título, “Por que impede continuar”, lista de passos, “Como confirmar”, botão “Resolver dependências” e `aria-live="polite"`. Afirmar ausência de botão “Próxima etapa”.

- [ ] **Step 5: Implementar `OrientacaoDeEtapa` e integrar na barra de próximo passo**

O botão despacha `abrir-aba` com `abaDestino`. Detalhes técnicos usam `<details>`. Alertas não bloqueantes ficam visualmente secundários.

- [ ] **Step 6: Executar testes**

Run: `pnpm exec vitest run shared/planning-guidance.test.ts client/src/components/orientacao-etapa.test.tsx shared/proximo-passo-planejamento.test.ts client/src/pagina-inicial.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/planning-guidance.ts shared/planning-guidance.test.ts shared/proximo-passo-planejamento.ts client/src/components/OrientacaoDeEtapa.tsx client/src/components/orientacao-etapa.test.tsx client/src/pages/Home.tsx client/src/planilha.css
git commit -m "feat: explain and resolve planning blockers"
```

### Task 3: Rede de Dependências legível e acionável

**Files:**
- Modify: `client/src/components/AbaDependencias.tsx`
- Modify: `client/src/planilha.css`
- Create: `client/src/components/dependencias-layout.test.tsx`
- Modify: `server/dependency-creation-regression.test.ts`

**Interfaces:**
- Consumes: `OrientacaoDeEtapa` da Task 2.
- Produces: filtros locais `{ busca: string; tipo: "todos" | "FS" | "SS" | "FF" | "SF"; somenteCriticas: boolean }` sem mutar a rede.

- [ ] **Step 1: Escrever teste falho do layout**

Renderizar 39 vínculos e afirmar: formulário em região “Adicionar vínculo”; tabela em região separada “Rede atual”; contagem “39 vínculos”; pesquisa; filtro por tipo; tabela fora do mesmo grid de 2 colunas; nenhum `max-height:205px` aplicável à rede.

- [ ] **Step 2: Escrever teste de remoção protegida**

Afirmar que o primeiro clique abre confirmação com predecessora e sucessora e que somente “Remover vínculo” executa a mutation. Escape/cancelar preservam o vínculo.

- [ ] **Step 3: Executar testes para confirmar falha**

Run: `pnpm exec vitest run client/src/components/dependencias-layout.test.tsx server/dependency-creation-regression.test.ts`

Expected: FAIL no layout, filtros e confirmação.

- [ ] **Step 4: Implementar o layout vertical**

Formulário compacto acima; resumo estrutural; rede em largura total com cabeçalho fixo, pesquisa, filtros e altura `clamp(320px, 55vh, 720px)`. Texto longo expande pela linha selecionada e continua disponível em `title`.

- [ ] **Step 5: Integrar orientação didática**

Rede inválida mostra causa, consequência, passos, ação de correção e critério de confirmação. Versão aprovada explica que é necessário abrir versão de trabalho sem sugerir perda da baseline.

- [ ] **Step 6: Executar testes e checagem visual em 1366 px e 1024 px**

Run: `pnpm exec vitest run client/src/components/dependencias-layout.test.tsx server/construction/dependency-validator.test.ts server/dependency-creation-regression.test.ts && pnpm check`

Expected: PASS; tabela e formulário utilizáveis nas duas larguras.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/AbaDependencias.tsx client/src/components/dependencias-layout.test.tsx client/src/planilha.css server/dependency-creation-regression.test.ts
git commit -m "feat: make dependency network readable and guided"
```

### Task 4: Estados independentes de avanço físico e financeiro

**Files:**
- Create: `shared/progress-readiness.ts`
- Create: `shared/progress-readiness.test.ts`
- Modify: `client/src/lib/dashboard-integridade.ts`
- Modify: `client/src/lib/dashboard-integridade.test.ts`
- Modify: `client/src/components/ControlTowerDashboard.tsx`
- Modify: `client/src/components/dashboard-integridade-render.test.ts`
- Modify: `client/src/index.css`

**Interfaces:**
- Produces: `avaliarProntidaoDeAvanco(input): { fisico: "disponivel" | "sem_pesos" | "sem_producao" | "erro"; financeiro: "disponivel" | "sem_orcamento" | "cobertura_incompleta" | "didatico" | "erro"; orientacoes: OrientacaoDeBloqueio[] }`.
- Consumes: pesos físicos aprovados, produção confirmada até `asOf`, orçamento aprovado/rastreável e cobertura.

- [ ] **Step 1: Escrever matriz falha de prontidão**

Cobrir: sem pesos; pesos sem produção; produção sem orçamento; orçamento didático; 3 atividades sem custo; tudo válido. Afirmar que estado financeiro nunca bloqueia progresso por atividade e que EVM só fica disponível no último caso.

- [ ] **Step 2: Executar teste para confirmar falha**

Run: `pnpm exec vitest run shared/progress-readiness.test.ts client/src/lib/dashboard-integridade.test.ts`

Expected: FAIL porque os estados ainda estão acoplados.

- [ ] **Step 3: Implementar regra pura e adaptar dashboard**

Substituir “régua validada” por textos específicos. Mostrar cartões separados “Avanço físico” e “Valor agregado (EV)”. Sem pesos, mostrar atividade por atividade e orientação “Definir pesos físicos”; sem orçamento, “Aprovar orçamento de referência”.

- [ ] **Step 4: Escrever e executar teste de conteúdo didático**

Afirmar que nenhum texto contém “régua validada”; cada estado tem problema, consequência, ação e evidência. Orçamento didático mostra “teste” e não habilita EV.

Run: `pnpm exec vitest run shared/progress-readiness.test.ts client/src/lib/dashboard-integridade.test.ts client/src/components/dashboard-integridade-render.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/progress-readiness.ts shared/progress-readiness.test.ts client/src/lib/dashboard-integridade.ts client/src/lib/dashboard-integridade.test.ts client/src/components/ControlTowerDashboard.tsx client/src/components/dashboard-integridade-render.test.ts client/src/index.css
git commit -m "feat: separate physical and financial readiness"
```

### Task 5: Gantt sem ruído e com seleção operacional

**Files:**
- Modify: `client/src/components/VisualizacaoPlanejamento.tsx`
- Modify: `client/src/planilha.css`
- Modify: `client/src/components/aurora-piloto.css`
- Modify: `shared/gantt-dependencias-visuais.ts`
- Modify: `shared/gantt-dependencias-visuais.test.ts`
- Create: `client/src/components/gantt-semantica-visual.test.tsx`
- Modify: `shared/gantt-export-svg.ts`

**Interfaces:**
- Consumes: identidade por `activityId` da Task 1.
- Produces: `gerarSetasVisiveisGantt(..., atividadeSelecionadaId?: number)` com estado `relacionada` para predecessor/sucessor selecionado.
- Produces: tokens CSS `--gantt-planned`, `--gantt-critical`, `--gantt-actual`, `--gantt-baseline`, `--gantt-warning`, `--gantt-milestone`.

- [ ] **Step 1: Escrever testes falhos de semântica visual**

Afirmar: hoje é linha sólida rotulada; início da obra só aparece se diferente de hoje e tem rótulo; não existe linha pontilhada sem legenda; baseline usa padrão adicional; caminho crítico inclui texto/ícone; dependências não relacionadas ficam atenuadas e as relacionadas à seleção ganham destaque.

- [ ] **Step 2: Executar testes para confirmar falha**

Run: `pnpm exec vitest run client/src/components/gantt-semantica-visual.test.tsx shared/gantt-dependencias-visuais.test.ts`

Expected: FAIL na linha de início e no destaque por seleção.

- [ ] **Step 3: Implementar tokens e camadas visuais**

Aplicar a paleta da especificação com contraste WCAG AA para texto. Grade mensal discreta, fins de semana em faixa, hoje sólido, início rotulado. Padrão/ícone complementa cor para estados.

- [ ] **Step 4: Implementar dependências contextuais**

Com nenhuma seleção, manter ligações discretas ou permitir ocultá-las. Com atividade selecionada, realçar somente predecessoras/sucessoras diretas; manter botão “Dependências” e legenda correspondente.

- [ ] **Step 5: Manter exportação equivalente**

Atualizar SVG exportado com as mesmas cores, rótulos de hoje/início e identidade por atividade; não alterar datas.

- [ ] **Step 6: Executar regressões**

Run: `pnpm exec vitest run client/src/components/gantt-semantica-visual.test.tsx shared/gantt-dependencias-visuais.test.ts shared/gantt-export-svg.test.ts client/src/components/gantt-baseline-regression.test.ts shared/gantt-baseline-visual.test.ts`

Expected: PASS; baseline congelada e datas atuais permanecem distintas.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/VisualizacaoPlanejamento.tsx client/src/planilha.css client/src/components/aurora-piloto.css shared/gantt-dependencias-visuais.ts shared/gantt-dependencias-visuais.test.ts client/src/components/gantt-semantica-visual.test.tsx shared/gantt-export-svg.ts
git commit -m "feat: clarify Gantt colors markers and dependencies"
```

### Task 6: Cronograma Operacional e inspetor sincronizado

**Files:**
- Create: `client/src/components/CronogramaOperacional.tsx`
- Create: `client/src/components/InspetorAtividade.tsx`
- Create: `client/src/lib/cronograma-operacional.ts`
- Create: `client/src/lib/cronograma-operacional.test.ts`
- Create: `client/src/components/cronograma-operacional.test.tsx`
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/modules/abas.ts`
- Modify: `client/src/modules/navegacao-sidebar.ts`
- Modify: `client/src/modules/navegacao-workspace.ts`
- Modify: `client/src/planilha.css`

**Interfaces:**
- Produces: `type EstadoCronogramaOperacional = { atividadeSelecionadaId: number | null; modo: "cronograma" | "fluxo" | "rede"; busca: string; filtro: "todas" | "criticas" | "atrasadas" | "bloqueadas" | "sem_medicao" }`.
- Produces: `selecionarLinhasOperacionais(linhas, estado)` e `resumirAtividadeOperacional(activityId, fontes)`.
- Consumes: Task 1 identity, Task 2 guidance, Task 5 Gantt and existing LOB/dependencies.

- [ ] **Step 1: Escrever teste falho do estado sincronizado**

Com 30 atividades/27 WBS, selecionar ID 102 e afirmar que grade, Gantt e inspetor apontam somente para 102. Trocar modo para Fluxo preserva seleção e filtro quando a atividade tem local; caso contrário mostra orientação de vínculo.

- [ ] **Step 2: Escrever teste falho do inspetor**

Afirmar seções Planejado, Baseline, Realizado, Rede, Local e Restrições. Dados ausentes aparecem como “Sem dado” com ação didática. Escape fecha, Tab fica no painel e foco volta à linha.

- [ ] **Step 3: Executar testes para confirmar falha**

Run: `pnpm exec vitest run client/src/lib/cronograma-operacional.test.ts client/src/components/cronograma-operacional.test.tsx`

Expected: FAIL porque os componentes não existem.

- [ ] **Step 4: Implementar o modelo puro**

Filtros não mutam dados. Estado serializa `modo`, `filtro`, `busca` e `atividade` na query string usando APIs existentes, sem adicionar dependência.

- [ ] **Step 5: Implementar `InspetorAtividade`**

Ler as fontes existentes; restrições vêm do lookahead/controle com corte de data e estado aberto/em andamento. Ações despacham abas técnicas, não gravam datas locais.

- [ ] **Step 6: Implementar `CronogramaOperacional`**

Compor grade e Gantt no modo Cronograma; reutilizar LOB no modo Fluxo; incorporar a Rede no modo Rede. Grade e linha do tempo compartilham seleção/expansão. Manter abas antigas acessíveis durante o piloto.

- [ ] **Step 7: Atualizar navegação**

Adicionar “Cronograma” como entrada principal do grupo CRONOGRAMA. Gantt e Linha de Balanço permanecem como atalhos/vistas até a validação ao vivo.

- [ ] **Step 8: Testar 500 e 2.000 atividades**

Criar teste do modelo que filtra/seleciona 2.000 itens sem duplicar IDs. Na interface, aplicar `content-visibility: auto` ou virtualização já disponível quando a lista exceder 50 linhas; verificar que controle focado continua montado.

- [ ] **Step 9: Executar testes e tipagem**

Run: `pnpm exec vitest run client/src/lib/cronograma-operacional.test.ts client/src/components/cronograma-operacional.test.tsx client/src/modules/navegacao-sidebar.test.ts client/src/modules/navegacao-workspace.test.ts && pnpm check`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add client/src/components/CronogramaOperacional.tsx client/src/components/InspetorAtividade.tsx client/src/lib/cronograma-operacional.ts client/src/lib/cronograma-operacional.test.ts client/src/components/cronograma-operacional.test.tsx client/src/pages/Home.tsx client/src/modules/abas.ts client/src/modules/navegacao-sidebar.ts client/src/modules/navegacao-workspace.ts client/src/planilha.css
git commit -m "feat: add integrated operational schedule"
```

### Task 7: Regressão, causa → efeito e validação ao vivo

**Files:**
- Modify: `docs/IMPROVEMENTS.md`
- Modify: `docs/DECISIONS.md`
- Create: `server/cronograma-operacional-regression.test.ts`
- Create: `client/src/components/cronograma-operacional-accessibility.test.tsx`

**Interfaces:**
- Consumes: todas as interfaces das Tasks 1–6.
- Produces: evidência de release e registro das decisões permanentes.

- [ ] **Step 1: Escrever regressão de causa → efeito**

No PGlite: alterar duração → CPM fica desatualizado → orientação bloqueia baseline → recalcular CPM válido → Gantt muda → baseline anterior não muda. Alterar vínculo → mesma cadeia. Lançar produção confirmada → atividade muda, agregado continua indisponível sem pesos aprovados.

- [ ] **Step 2: Escrever auditoria de acessibilidade**

Cobrir rótulos, foco visível, Escape, restauração de foco, `aria-live`, ações específicas e ausência de estado comunicado apenas por cor.

- [ ] **Step 3: Executar testes focados**

Run: `pnpm exec vitest run server/cronograma-operacional-regression.test.ts client/src/components/cronograma-operacional-accessibility.test.tsx`

Expected: PASS.

- [ ] **Step 4: Executar verificação completa**

Run: `pnpm check && pnpm test --run && pnpm build`

Expected: tipagem, 168+ arquivos de teste e build aprovados; skips externos explicitamente relatados.

- [ ] **Step 5: Auditar o diff**

Run: `git diff --check && git status --short && git diff --stat main...HEAD`

Expected: sem whitespace inválido, segredos, artefatos ou mudanças fora do escopo.

- [ ] **Step 6: Atualizar decisões e melhorias**

Registrar: `activityId` é identidade operacional; WBS agrupa; avanço físico agregado exige pesos aprovados; bloqueios usam contrato didático; Cronograma é o centro operacional.

- [ ] **Step 7: Commit**

```bash
git add server/cronograma-operacional-regression.test.ts client/src/components/cronograma-operacional-accessibility.test.tsx docs/IMPROVEMENTS.md docs/DECISIONS.md
git commit -m "test: certify operational schedule workflow"
```

- [ ] **Step 8: Abrir PR e aguardar todos os checks**

Run: `git push -u origin feat/cronograma-operacional-integrado && gh pr create --fill`

Expected: build-guard, schema-audit e validate aprovados antes do merge.

- [ ] **Step 9: Publicar e verificar versão**

Após merge autorizado, aguardar `/healthz.commit` corresponder ao commit da `main` e `/readyz.database` ser `ok`.

- [ ] **Step 10: Validar a Escola ao vivo**

Verificar, sem alterar outras obras:

1. 30 atividades distintas no Cronograma;
2. Rede com 39 vínculos legíveis;
3. Gantt sem linhas sem explicação;
4. seleção de atividade destaca somente suas relações;
5. baseline v8 continua vigente e congelada;
6. LOB mantém 27 agrupamentos localizados e 0 pendentes;
7. dashboard explica pesos físicos, produção e orçamento separadamente;
8. bloqueio simulado conduz à aba correta e explica como confirmar a solução.

Expected: PASSOU em cada item ou status APROVADO COM RESSALVAS com dado real faltante explicitado.

## Self-Review

- **Cobertura da especificação:** identidade, didática, Rede, Gantt, Cronograma, inspetor, progresso, baseline, LOB, acessibilidade, escala e validação ao vivo estão associados a Tasks 1–7.
- **Granularidade:** cada task entrega uma unidade revisável e termina em testes + commit.
- **Consistência de tipos:** `activityId` nasce na Task 1 e é consumido nas Tasks 5–6; `OrientacaoDeBloqueio` nasce na Task 2 e é consumida nas Tasks 3–4–6.
- **Riscos adicionais cobertos:** produção histórica ambígua, múltiplos bloqueios, baseline sem datas, orçamento didático e escala de 2.000 itens aparecem em testes explícitos.
- **Proporção:** o plano especifica contratos, testes e comandos; corpos de implementação permanecem a cargo do executor.
