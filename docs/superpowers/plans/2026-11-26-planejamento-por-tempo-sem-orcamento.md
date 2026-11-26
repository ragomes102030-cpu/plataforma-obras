# Plano: planejamento de obra por atividades e prazo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer da programação e do acompanhamento de prazo um fluxo utilizável sem orçamento, conservando o CPM, a EAP, a baseline e os módulos financeiros existentes.

**Architecture:** Evoluir os contratos de prontidão por domínio, permitir que obras em rascunho não tenham datas inventadas, registrar atualizações temporais auditáveis separadas da produção física e alinhar Cronograma/Dashboard com essas distinções. Reutilizar `schedule_activities`, versões de plano, CPM, calendário, baseline e `production_entries`; não criar motor concorrente.

**Tech Stack:** TypeScript, React, tRPC, Drizzle ORM, PostgreSQL, Vitest, migrations Drizzle.

**Spec:** `docs/superpowers/specs/2026-11-26-planejamento-por-tempo-design.md`

## Restrições globais

- Não criar nem editar orçamento como pré-requisito do caminho de prazo.
- Não inventar datas: início civil é opcional na criação e precisa ser informado
  antes de calcular datas/baseline. Término é derivado pelo CPM, sem horizonte
  padrão de 180 dias.
- Não transformar duração transcorrida em avanço físico nem valor agregado.
- Não gravar status temporal como `production_entries` nem como medição
  contratual.
- Preservar IDs de atividade, versão, histórico de baseline e dados existentes;
  migração mantém todas as datas já persistidas.
- Uma pendência de LOB afeta apenas LOB; pendência financeira afeta apenas
  financeiro. Registro de andamento não requer custo, quantidade ou local quando
  não aplicáveis.
- Mudanças de duração/lógica invalidam CPM e exibem isso até novo cálculo; uma
  atualização de campo não altera silenciosamente baseline.
- Nenhuma operação desta implementação pode alterar a obra 26 ou sua versão 4.

## Foco de revisão

- Data de início ausente não pode virar `new Date()` em um cálculo como se fosse
  a data planejada da obra.
- A API e a UI distinguem “atualização de prazo registrada”, “avanço físico
  calculável” e “valor financeiro calculável”.
- Correção de atualização não apaga o evento anterior; obra e versão são
  verificadas no servidor em todas as mutações.
- A prontidão exibida é contextual: Dashboard/Cronograma não promovem o primeiro
  bloqueio financeiro ao bloqueio geral do planejamento.

---

## Task 1 — Separar prontidão de planejamento, acompanhamento e domínios opcionais

**Arquivos:** `shared/obra-readiness.ts`, `shared/obra-readiness.test.ts`,
`client/src/components/ReadinessGate.tsx`,
`client/src/components/CronogramaOperacional.tsx`,
`client/src/components/ControlTowerDashboard.tsx`,
`client/src/components/AbaBaseline.tsx`, `client/src/components/AbaOrcamento.tsx`.

- [x] Substituir o uso universal de `primeiraBarreira` por resultados tipados por
  domínio/contexto: estruturação, cálculo de prazo, registro de andamento,
  comparação com baseline, físico, financeiro e LOB. Manter uma função de
  compatibilidade durante a migração dos consumidores.
- [x] Definir que custo ausente, medição contratual ausente, peso físico ausente
  e atividade fora de LOB não bloqueiam estruturação nem registro de andamento.
  A existência de atividade na versão operacional permite registrar andamento
  mesmo sem CPM atual. CPM inválido/desatualizado bloqueia somente datas e
  projeções calculadas; ausência de baseline impede comparação de prazo, mas
  não impede registrar atualização.
- [x] Atualizar `ReadinessGate` para receber o domínio/tela e abrir a etapa
  responsável pela pendência correspondente. No Cronograma, priorizar bloqueios
  de EAP, atividade, rede e CPM; no Orçamento, mostrar os financeiros.
- [x] Preservar `shared/progress-readiness.ts` como fonte distinta para físico e
  financeiro e conectar seus estados sem reinterpretar um domínio como outro.
- [x] Testar que obra sem orçamento, medição, peso e locais LOB ainda permite
  acompanhar prazo quando possui cronograma válido; testar também que erro de
  CPM continua visível e que cada pendência aparece na tela dona do domínio.

**Verificação:**

```powershell
pnpm test -- shared/obra-readiness.test.ts shared/progress-readiness.test.ts
pnpm check
```

## Task 2 — Criar obra em rascunho sem prazo final fictício

**Arquivos:** `client/src/pages/Home.tsx`, `server/routers.ts`, `drizzle/schema.ts`,
nova migration em `drizzle/`, testes de criação/projeto em
`server/routers.test.ts`, `shared/project-model.test.ts` e testes da tela de
criação existentes ou novos.

- [x] Tornar `plannedStart` nullable no banco e manter `plannedFinish` nullable;
  criar migration journalizada que só remove `NOT NULL` e preserva valores
  existentes. Identificar e corrigir todos os consumidores que usam essas
  colunas como âncora obrigatória.
- [x] Remover os defaults que atribuem `new Date()` e `+180 dias` em
  `projects.create`. Criar a obra como rascunho com datas nulas quando o usuário
  ainda não as informou.
- [x] No formulário de criação, apresentar a data inicial como opcional e o
  término como “calculado após programar atividades”; não pedir data final
  manual como se fosse cronograma validado.
- [x] Permitir montar EAP, atividades, durações relativas e dependências sem
  data civil. Ao calcular CPM com data, exigir âncora informada e explicar como
  cadastrá-la. Não usar fallback silencioso para hoje em visualizações ou
  mutações de cronograma.
- [x] Depois de CPM válido, derivar e persistir/expor `plannedFinish` conforme o
  término calculado. Recalcular esse valor ao recalcular a programação, sem
  confundi-lo com baseline.
- [x] Provar em migration que obras existentes conservam início e término e
  que uma obra nova sem datas é criada e pode estruturar atividades.

**Verificação:**

```powershell
pnpm test -- server/routers.test.ts shared/project-model.test.ts
pnpm db:verify:scratch
pnpm check
```

## Task 3 — Registrar atualizações de prazo com histórico

**Arquivos:** `drizzle/schema.ts`, nova migration, `server/routers.ts`, novo
módulo puro em `shared/` para validação/normalização da atualização,
`client/src/components/InspetorAtividade.tsx`,
`client/src/components/CronogramaOperacional.tsx`, testes em
`server/construction/` e `shared/`.

- [x] Adicionar tabela append-only de atualizações por atividade/versão com data
  de posição, estado, início/término reais, duração restante ou previsão de
  término, observação, autor, criação e referência opcional a evidência. Uma
  correção deve criar evento que aponta o evento corrigido.
- [x] Criar consulta de histórico e consulta do estado vigente pela última
  atualização não substituída. Isolar por projeto e versão, validar acesso e
  aceitar apontamento sobre a versão operacional aprovada (a aprovação congela
  o plano, não os fatos reais); impedir apontamento em versão histórica
  substituída.
- [x] Criar mutação tRPC para registrar atualização. Validar campos por estado:
  “em andamento” pede início real e previsão/duração restante; “concluída” pede
  término real; “bloqueada” pede motivo. A API não deve escrever em
  `production_entries`, `progress` financeiro ou boletim de medição.
- [x] Adicionar no inspetor o formulário “Atualizar andamento” e uma linha do
  tempo. Mostrar claramente a data de posição e separar “previsão de prazo” de
  “avanço físico”. Se houver quantidade medida, manter a ação existente de
  lançamento de produção.
- [x] Garantir que a atualização preserve a baseline e não marque CPM como
  recalculado. Atualização pode mudar estado/forecast reportado; mudanças no
  plano continuam exigindo recálculo CPM.
- [x] Cobrir criação, correção com histórico preservado, isolamento entre obras,
  apontamento permitido na versão operacional aprovada, apontamento negado na
  versão histórica substituída, estados incompletos e ausência de qualquer
  gravação financeira/física no update temporal.

**Verificação:**

```powershell
pnpm test -- shared/production-entries.test.ts server/routers.test.ts
pnpm check
```

## Task 4 — Tornar prazo a visão padrão do acompanhamento

**Arquivos:** `client/src/components/ControlTowerDashboard.tsx`,
`client/src/components/CronogramaOperacional.tsx`,
`client/src/components/InspetorAtividade.tsx`,
`shared/progress-readiness.ts` e respectivos testes de apresentação/contrato.

- [x] Criar resumo de prazo com término previsto, variação contra baseline
  quando disponível, contagem crítica/atrasada, próxima janela de atividades,
  atividades bloqueadas e data da última atualização. Sem baseline, exibir
  estado explícito de comparação indisponível, mantendo atualização habilitada.
- [x] Mostrar baseline e CPM como séries distintas no Gantt e na Dashboard;
  refletir atividade concluída/em andamento/bloqueada usando atualização
  temporal, sem deduzir status do tempo decorrido.
- [x] Reclassificar a orientação de atividade sem unidade específica para
  pendência de LOB; permitir classificação justificada fora da LOB quando não
  houver repetição. A tela de prazo continua liberada.
- [x] Se houver curva sem orçamento, nomeá-la “programação de prazo” ou “avanço
  físico”, conforme a série selecionada. Curva financeira/valor agregado só
  aparece quando seus próprios dados estiverem prontos.
- [x] Testar cenário de obra sem orçamento e sem LOB: prazo e andamento visíveis,
  mensagens financeiras isoladas e nenhuma falsa conclusão de avanço físico.

**Verificação:**

```powershell
pnpm test -- shared/progress-readiness.test.ts shared/obra-readiness.test.ts server/cronograma-operacional-regression.test.ts
pnpm check
pnpm build
```

**Resultado local:** PASSOU; 16 arquivos / 96 testes focados, `pnpm check`,
`pnpm build` e `pnpm db:verify:scratch`. Node do ambiente é 24.21.0 enquanto
o projeto declara 22.x; o build concluiu com avisos de analytics ausentes e
bundle principal acima de 500 kB.

## Task 5 — Validar o fluxo integrado em obra demonstrativa isolada

**Arquivos:** `scripts/e2e-fictitious.ts` ou novo cenário dedicado e documentação
de operação em `docs/`.

- [ ] Executar o cenário do zero: criar obra sem preço/data final; cadastrar EAP,
  atividades, duração e dependências; informar início planejado; calcular CPM;
  aprovar baseline de prazo; registrar início real, atraso/revisão e conclusão.
- [ ] Conferir após recarga: eventos do histórico, datas atuais, baseline
  inalterada, projeção recalculada apenas após ação explícita e ausência de
  produção/custo inventados.
- [ ] Conferir Dashboard ao vivo em ambiente isolado: visão de prazo disponível,
  avisos financeiros separados e LOB indisponível somente para atividades
  aplicáveis sem unidade.
- [ ] Não reutilizar Piazza 26 como fixture nem publicar para produção durante
  a implementação. Registrar resultados `PASSOU`, `FALHOU` ou `NÃO TESTÁVEL` e
  URL/commit do ambiente usado.

**Verificação:**

```powershell
pnpm e2e:fictitious
```

## Sequência e conclusão

Implementar em ordem: Tarefa 1 (contratos de prontidão), Tarefa 2 (rascunho e
datas), Tarefa 3 (histórico de acompanhamento), Tarefa 4 (painéis) e Tarefa 5
(fluxo integrado). Cada tarefa deve terminar com migração segura e sua
verificação direcionada antes da seguinte. Ao concluir, atualizar
`docs/DECISIONS.md` e `docs/IMPROVEMENTS.md` com as decisões de domínio, limites
de métricas e resultados de validação.

**Estado desta implementação:** Tasks 1–4 concluídas no código local. Task 5
permanece aberta: não foi criado deploy nem executado o cenário integrado na
Dashboard ao vivo; a obra 26 não foi usada nem alterada.
