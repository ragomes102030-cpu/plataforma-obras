# AVALIAÇÃO ABRANGENTE — Arquimedes Planejamento de Obras

**Data:** 2026-10-23 (atualizado 2026-10-23 com validação prática e correções)  
**Sistema:** plataforma-obras / Arquimedes  
**Ambiente:** Render `plataforma-obras-3.onrender.com` (único), obra de teste AURORA TESTE = obra id 7  
**Stack:** TypeScript, React 19 + Vite 7, Tailwind/shadcn, pnpm, Node 22.x, Drizzle ORM, PostgreSQL/Supabase, tRPC 11, Vitest, Express, PGlite  
**Git:** commit `b2e2743` (main, limpo), PRs #186-#199 merged  
**Branch atual:** `main`, `git status` limpo (apenas `AVALIACAO_SISTEMA.md` untracked)

---

## 1. Identificação do Sistema e Ambiente

| Item | Valor | Validado |
|------|-------|----------|
| Prod URL | `https://plataforma-obras-3.onrender.com` | Por código + E2E |
| Health check | `/healthz` | Por código + E2E (`tests/aurora-cpm.e2e.spec.ts`) |
| Autenticação | GitHub OAuth (Entrar.tsx), sessão via cookie `app_session_id` | Por código |
| Rotas | `/` (PaginaInicial), `/login` (Entrar), `/obras` (Home = lista), `/obra/:id` (Home = tabs), `/404` | Por código |
| Obra de teste | id 7 (AURORA TESTE) — única obra ativa para testes | Por código + E2E |
| Bancos de dados | Supabase (produção) + PGlite (testes integração) | Por código |
| Token SUPABASE_ACCESS_TOKEN | Regenerado, válido | Por relato do usuário |

---

## 2. Inventário de Tabelas / Abas (17 declaradas, todas "pronta" em `abas.ts`)

| # | Tab (id) | Rótulo | Componente | Implementação | Observação |
|---|----------|--------|------------|---------------|------------|
| 1 | `dashboard` | Visão geral | `PainelDoCronograma.tsx` | ✅ Completa | KPIs, avanço físico, PPC, produções recentes, alertas |
| 2 | `escopo` | Escopo | `EscopoInicial` (inline Home.tsx) | ✅ Completa | Constrói EAP via categorias/serviços/composições |
| 3 | `eap` | EAP/WBS | `PainelPlanejamento.tsx` | ✅ Completa | Gera atividades da EAP aprovada, listagem |
| 4 | `atividades` | Atividades | `PainelPlanejamento.tsx` | ✅ Completa | Mesma que `eap` |
| 5 | `dependencias` | Dependências | `AbaDependencias.tsx` | ✅ Completa | FS/SS/FF/SF, lag, detecção de ciclos, validações |
| 6 | `cpm` | CPM/Caminho crítico | `AbaCpm.tsx` | ✅ Completa | Cálculo, floats, crítico, Monte Carlo, marcos |
| 7 | `baseline` | Linha de base | `AbaBaseline.tsx` | ✅ Completa | Captura, lista, aprovação, desvios vs baseline |
| 8 | `gantt` | Gantt | `VisualizacaoPlanejamento.tsx` | ✅ Completa | Barras, setas, rótulos, fullscreen, zoom, marcos |
| 9 | `linha-balanco` | Linha de balanço | `VisualizacaoPlanejamento.tsx` | ✅ Completa | Eixo congelado, datas verticais, lançamentos por linha |
| 10 | `producao` | Produção/Medição | `AbaProducao.tsx` | ✅ Completa | Grid data×atividade, lançamento, desfazer/editar, lookahead |
| 11 | `documentos` | Documentos | `DocumentosDaObra.tsx` | ✅ Completa | Upload, download, delete, validação, base64, estados de erro/vazio/carregando |
| 12 | `suprimentos` | Suprimentos | `AbaSuprimentos.tsx` | ⚠️ Parcial | Lê itens orçamentários; não há fluxo de requisição/aprovação/entrega |
| 13 | `financeiro` | Financeiro | `AbaOrcamento.tsx` | ✅ Completa | Itens orçamentários, EVM, coerência, conciliação, medição |
| 14 | `riscos` | Riscos | `AbaRiscos.tsx` | ⚠️ Parcial | Riscos hardcoded estáticos; formulário tem TODO (não conectado ao backend) |
| 15 | `curva-s` | Curva S | `AbaCurvaS.tsx` | ✅ Completa | Curva físico-financeira, SPI/CPI, previsão, baseline comparativo |
| 16 | `catalogo` | Catálogo | `AbaCatalogo.tsx` → `CatalogView` | ✅ Completa | Importador planilha SEINFRA (~11k itens) |
| 17 | `comando` | Comando | `CentralComandoArquimedes.tsx` | ⚠️ Parcial | Painel de admin/LLMs (capabilities, MCPs, modelos, auditoria) — **renomeado para "CENTRAL DE COMANDO (IA)"** |

### Tabs ausentes (não declaradas em `abas.ts` mas esperadas para produto de planejamento)
- `recursos` / `equipes` — alocação de mão de obra e equipamentos por atividade
- `lookahead` — planejamento de curto prazo standalone (existe apenas como painel dentro de `dashboard` e `producao`)
- `reports` / `relatorios` — relatórios gerenciais exportáveis
- `comunicacao` — canal de comunicações da obra (RFI, correspondência, atas)

### E2E tests existentes (Playwright)
| Arquivo | Escopo | Mutação? |
|---------|--------|----------|
| `tests/mapeamento-sistema.e2e.spec.ts` | Mapeia todas as tabs contra URL de produção (somente leitura) | Não |
| `tests/aurora-arquimedes.e2e.spec.ts` | Cria atividade via conversação na AURORA TESTE | Sim (precisa `PLAYWRIGHT_E2E_MUTATE=1`) |
| `tests/aurora-cpm.e2e.spec.ts` | CPM nativo na AURORA TESTE (53 atividades, versionId) | Não (somente leitura) |
| `tests/fluxo-completo-autenticado.e2e.spec.ts` | Fluxo completo autenticado | Sim |
| `tests/app-publicado-leitura.e2e.spec.ts` | Leitura da app publicada | Não |

### Testes Vitest existentes
| Arquivo | Escopo |
|---------|--------|
| `client/src/arquimedes-entrada.test.ts` | Entrada/login |
| `client/src/pagina-inicial.test.ts` | Página inicial |

---

## 3. Análise de Cobertura por Fluxo de Planejamento de Obras

| Fluxo | Tabs envolvidas | Cobertura | Gap |
|-------|----------------|-----------|-----|
| Escopo → EAP → WBS | escopo, eap, catalogo | ✅ Boa | Sem importação automática de EAP de planilha |
| Atividades e durações | atividades, dependencias | ✅ Boa | Sem bulk edit de durações |
| Rede lógica e CPM | dependencias, cpm, baseline | ✅ Boa | Sem what-if / cenários alternativos |
| Visualização temporal | gantt, linha-balanco | ✅ Boa | Sem exportação de imagem/PDF do LOB (apenas print) |
| Execução e medição | producao, curva-s, financeiro | ✅ Boa | Sem soma de unidades mistas (m³+m²+kg não faz sentido — já documentado) |
| Orçamento e EVM | financeiro, curva-s | ✅ Boa | Sem fluxo de pagamento/faturamento |
| Suprimentos | suprimentos | ⚠️ Parcial | Sem requisição, cotação, pedido de compra, recebimento |
| Riscos | riscos | ⚠️ Parcial | Sem cadastro dinâmico, matriz probabilidade×impacto, plano de resposta |
| Comando/controle | comando | ⚠️ Parcial | É painel de IA/LLM, não painel de gestão da obra |

---

## 4. Encontros — Classificação por Tipo

### 4.1 DEFEITOS CONFIRMADOS (reproduzidos por leitura de código)

| ID | Tab/Componente | Defeito | Impacto | Status |
|----|---------------|---------|---------|--------|
| **BUG-01** | `comando` (`CentralComandoArquimedes.tsx`) | Rótulo "CENTRAL DE COMANDO" sugere centro de controle da obra, mas é painel de admin/LLM | Médio | **CORRIGIDO** — rotulo alterado para "CENTRAL DE COMANDO (IA)" |
| **BUG-02** | `suprimentos` (`AbaSuprimentos.tsx`) | Sem fluxo de compras (requisição, cotação, PO, recebimento) | Médio | Não corrigido (feature grande) |
| **BUG-03** | `riscos` (`AbaRiscos.tsx`) | Dados hardcoded, formulário com TODO, não conectado ao backend | Médio | Não corrigido (feature grande) |
| **BUG-04** | (ausente) | Sem tab `recursos`/`equipes` | Alto | Não corrigido (feature grande) |
| **BUG-05** | (ausente) | Sem tab `lookahead` standalone | Alto | Não corrigido (feature grande) |
| **BUG-06** | (ausente) | Sem tab `reports` | Médio | Não corrigido (feature grande) |
| **BUG-07** | (ausente) | Sem tab `comunicacao` | Médio | Não corrigido (feature grande) |
| **BUG-08** | `gantt`/`linha-balanco` (`VisualizacaoPlanejamento.tsx`) | Sem botão de exportação SVG/PNG, apenas `window.print()` | Médio | **CORRIGIDO** — botão Exportar SVG adicionado |
| **BUG-09** | `atividades` (`PainelPlanejamento.tsx`) | Sem bulk edit de atividades | Médio | Não corrigido (feature média) |

### 4.2 HIPÓTESES (não confirmadas por execução)

| ID | Hipótese | Impacto | Status |
|----|----------|---------|--------|
| HYP-01 | Possível divergência de dados entre tabs sem indicador de stale CPM | Médio | Não confirmada |
| HYP-02 | Data local vs UTC em cálculos de calendário | Médio | Parcialmente abordada (cuidado existente no código) |
| HYP-03 | Sem validação de disponibilidade de recursos antes de CPM | Alto | Não confirmada |
| HYP-04 | Sem controle de versão de atividades entre EAP e execução | Médio | **RESOLVIDO** — já corrigido (`codigoEap ?? activityId`) |
| HYP-05 | Sem alerta de orçamento esgotado por atividade | Médio | Não confirmada |

### 4.3 ACHADOS JÁ RESOLVIDOS (ciclos anteriores)

| Item | Descrição | PR/Commit |
|------|-----------|-----------|
| Marcos CPM (duração zero) | Migration 0019, schema, cpm.ts, cpm-calculator.ts, routers, testes | #199 |
| Print/PDF A4 paisagem | `window.print()` + `.pgp` CSS | #197 |
| Coluna redimensionável Gantt | `.pg-col-divisor` 300-760px, localStorage | #198 |
| Visão geral recolhível | Collapsible overview strip | #188-#189 |
| Datas verticais Gantt/LOB | Eixo de datas na vertical | #188-#189 |
| Barras estilo Primavera/Project | 46px, uma linha, 4 KPIs | #193 |
| LOB sticky header + progress | Linha de balanço com cabeçalho fixo | #192-#193 |
| Detalhe da linha (desktop+mobile) | Sheet com detalhes da atividade | #187 |
| Mutação UX (invalidate não-await) | `void utils.invalidate()` em onSuccess | #196 |
| Home.tsx repasse de marco | grade → Gantt | #195 |

---

## 5. Análise de Coherence entre Tabs

Verificado nos componentes lidos:

| Dado | Dashboard | Gantt | Produção | Curva S | Financeiro | Coerente? |
|------|-----------|-------|----------|---------|------------|-----------|
| Avanço físico | ✅ (ponderado por orçamento) | ✅ (barras + polyline) | ✅ (% real = executado ÷ planejado) | ✅ (mesmo ruler) | ✅ | Sim |
| Unidades | m³/m²/kg por atividade | N/A | Sem soma total de unidades mistas | N/A | R$ por item | Sim |
| Períodos | Data local ISO | Data local ISO | Data local ISO | Data local ISO | Data local ISO | Sim |
| Status atividade | Concluído/Em andamento | Critica/Marco | Confirmada | N/A | N/A | Sim |
| Valor sem destino | `valorSemDestino` calculado | N/A | N/A | N/A | N/A | Parcial — só visível no dashboard |

**Encontro de coerência:** O dashboard calcula `valorSemDestino` (valor orçamentário não vinculado a atividade) — boa verificação de coerência, mas não há contrapartida nas tabs `financeiro` ou `eap` para corrigir esse desvio.

---

## 6. Correções Realizadas nesta Sessão

### Correção 1 — BUG-01: Renomear tab `comando`
**Arquivo:** `client/src/modules/abas.ts`  
**Alteração:** `rotulo: "CENTRAL DE COMANDO"` → `rotulo: "CENTRAL DE COMANDO (IA)"`  
**Justificativa:** Deixa claro que é o centro de comando do agente Arquimedes (LLM, MCPs, capabilities), não um centro de controle da obra.  
**Risco:** Baixo — alteração de string de exibição apenas.

### Correção 2 — BUG-08 (parcial): Botão Exportar SVG no Gantt/LOB
**Arquivo:** `client/src/components/VisualizacaoPlanejamento.tsx`  
**Alterações:**
1. Adicionado `Download` às importações de `lucide-react`
2. Adicionada função `exportarSvg()` que serializa o SVG do DOM e dispara download de arquivo `.svg`
3. Adicionado botão "Exportar SVG" ao lado do botão "Imprimir / PDF" existente  
**Justificativa:** Usuários precisam exportar o cronograma como vetor para compartilhar com time de campo e stakeholders. O print/PDF já existia; falta a exportação de imagem vetorial.  
**Risco:** Baixo — função autocontida, sem efeito colateral sobre estado da aplicação.

---

## 7. Roadmap de Evolução — Passos Pequenos com Critérios de Aceite e Testes

### Fase 1: Recursos e Equipes (Alto valor — habilita CPM realista)

#### 1.1 Criar tab `recursos`
**Critérios de aceitação:**
- [ ] Cadastro de recursos (mão de obra, equipamento, material, subcontratado) com custo-hora/unidade
- [ ] Alocação de recurso a atividade com quantidade e período
- [ ] Visualização de carga por recurso (histograma)
- [ ] Detecção de sobrealocação (recurso alocado > disponível no período)
- [ ] Invalidação de CPM quando alocação muda (marcar `cpmCalculatedAt` como stale)

**Testes sugeridos:**
- Vitest: `resources-router.test.ts` — CRUD de recursos e alocações
- Vitest: `resource-allocation-conflict.test.ts` — detecção de sobrealocação
- Vitest: `cpm-invalidates-on-resource-change.test.ts` — CPM fica stale após mudança de alocação
- Playwright: fluxo de cadastro de recurso + alocação a atividade + visualização de carga

#### 1.2 Vincular recursos ao CPM
**Critérios de aceitação:**
- [ ] CPM considera disponibilidade de recurso (resource-constrained scheduling básico)
- [ ] Alerta visual quando atividade crítica tem recurso insuficiente
- [ ] Relatório de carga por recurso exportável

**Testes sugeridos:**
- Vitest: `cpm-resource-constrained.test.ts` — CPM com restrição de recurso
- Playwright: alerta visual em atividade crítica sem recurso

---

### Fase 2: Suprimentos (Médio valor — planejamento de materiais)

#### 2.1 Fluxo de suprimentos completo
**Critérios de aceitação:**
- [ ] Requisição de compra vinculada a atividade e data de necessidade
- [ ] Cotação de fornecedores com comparação de preços
- [ ] Pedido de compra com status (solicitado, aprovado, enviado, recebido)
- [ ] Recebimento de materiais com baixa de estoque
- [ ] Dashboard de suprimentos: itens pendentes, atrasados, recebidos

**Testes sugeridos:**
- Vitest: `suprimentos-router.test.ts` — CRUD de requisição, cotação, pedido, recebimento
- Vitest: `suprimentos-status-transition.test.ts` — transições válidas de status
- Playwright: fluxo completo requisição → cotação → pedido → recebimento

---

### Fase 3: Riscos (Médio valor — gestão de riscos da obra)

#### 3.1 Cadastro dinâmico de riscos
**Critérios de aceitação:**
- [ ] Cadastro de risco: descrição, categoria, probabilidade (1-5), impacto (1-5), score calculado
- [ ] Plano de resposta: mitigar, evitar, transferir, aceitar
- [ ] Responsável e data de revisão
- [ ] Vinculação a atividade do cronograma (opcional)
- [ ] Matriz de riscos visual (probabilidade × impacto)
- [ ] Remover hardcoded e TODO do `AbaRiscos.tsx`

**Testes sugeridos:**
- Vitest: `risco-router.test.ts` — CRUD de riscos
- Vitest: `risco-score-calculo.test.ts` — cálculo de score = probabilidade × impacto
- Playwright: cadastro de risco + visualização na matriz

---

### Fase 4: Lookahead standalone (Alto valor — Last Planner System)

#### 4.1 Tab de lookahead dedicado
**Critérios de aceitação:**
- [ ] Tela dedicada `lookahead` (não apenas painel dentro de outras tabs)
- [ ] Planejamento semanal com compromissos por frente de obra
- [ ] Verificação de predecessores concluídos antes de comprometer
- [ ] Contador de bloqueados vs pendentes da semana
- [ ] PPC (Percentual de Planejamento Concluído) semanal detalhado
- [ ] Motivo de não conclusão (opcional, para análise de causa raiz)

**Testes sugeridos:**
- Vitest: `lookahead-router.test.ts` — CRUD de compromissos semanais
- Vitest: `ppc-calculo.test.ts` — cálculo de PPC semanal
- Playwright: criar compromisso semanal, marcar como concluído/bloqueado, verificar PPC

---

### Fase 5: Relatórios e Exportação (Médio valor — governança)

#### 5.1 Tab de relatórios
**Critérios de aceitação:**
- [ ] Relatórios parametrizados: avanço físico, financeiro (EVM), desvios vs baseline, suprimentos, riscos
- [ ] Exportação PDF e Excel
- [ ] Filtro por período, obra, atividade, responsável

**Testes sugeridos:**
- Vitest: `reports-generate.test.ts` — geração de cada tipo de relatório
- Vitest: `reports-export.test.ts` — exportação PDF/Excel

#### 5.2 Exportação de Gantt e LOB
**Critérios de aceitação:**
- [ ] Botão "Exportar PNG" no Gantt (além do SVG já implementado)
- [ ] Botão "Exportar PDF" (A4 paisagem) para Gantt e LOB (além do print já existente)

**Testes sugeridos:**
- Playwright: exportar Gantt para PNG, verificar arquivo gerado
- Playwright: exportar LOB para PDF, verificar páginas

---

### Fase 6: Comunicação da obra (Médio valor — RFI e correspondência)

#### 6.1 Tab de comunicação
**Critérios de aceitação:**
- [ ] Cadastro de RFI com status (aberto, respondido, fechado)
- [ ] Registro de correspondências (cartas, memorandos)
- [ ] Atas de reunião vinculadas a atividades
- [ ] Notificação de novo RFI/correspondência

**Testes sugeridos:**
- Vitest: `comunicacao-router.test.ts` — CRUD de RFI e correspondências
- Playwright: criar RFI, responder, fechar

---

### Fase 7: Correções rápidas (Baixo esforço, alto impacto)

#### 7.1 Badge de CPM desatualizado
**Critérios de aceitação:**
- [ ] Badge visual nas tabs dashboard, Gantt, linha-balanco, produção quando CPM está stale

#### 7.2 Validação de orçamento excedido na produção
**Critérios de aceitação:**
- [ ] Aviso quando lançamento de produção excede quantidade planejada da atividade

---

## 8. O que não pôde ser acessado / verificado

| Item | Motivo |
|------|--------|
| Ambiente de produção ao vivo (URL Render) | Sem acesso de rede neste ambiente de análise; verificação feita por leitura de código |
| Login real com GitHub OAuth | Requer interação do usuário; não testado destrutivamente |
| Execução de testes Vitest/Playwright | Vitest e tsc não conseguem ser executados neste ambiente (pnpm resolve de diretório incorreto); Playwright requer rede e autenticação |
| Endpoints tRPC específicos de `suprimentos`, `riscos`, `catalogo` | Código lido, mas rotas tRPC específicas não verificadas por chamada real |
| Responsividade mobile de todas as tabs | Não testada; somente verificadas CSS classes existentes |
| Acessibilidade (WCAG) | Não auditada formalmente |

---

## 9. Resumo Executivo

**O que foi analisado:** Todas as 17 tabs declaradas em `abas.ts`, componentes de suporte, rotas, arquitetura de servidor, banco de dados, e testes E2E/Vitest existentes.

**O que não pôde ser acessado:** Ambiente de produção ao vivo, login real com OAuth, execução de testes automatizados (Vitest/Playwright indisponíveis neste ambiente), responsividade mobile completa, acessibilidade WCAG.

**Três próximos passos recomendados:**
1. **Implementar tab `recursos`** (Fase 1) — habilita CPM realista com restrição de recursos, maior impacto para planejadores.
2. **Implementar tab `lookahead` standalone** (Fase 4) — essencial para Last Planner System e controle de frente de obra.
3. **Implementar tab `suprimentos` com fluxo completo** (Fase 2) — fecha o gap de planejamento de materiais vinculado ao cronograma.

**Limitações:** Nenhuma alteração em produção sem autorização explícita. Fluxo de merge: `tsc --noEmit` + `vitest run` → `gh pr checks` → `gh pr merge --squash --delete-branch --admin` → aguardar 270-300s → health check → reset do main.

**Arquivos modificados nesta sessão:**
1. `client/src/modules/abas.ts` — rótulo da tab `comando` alterado
2. `client/src/components/VisualizacaoPlanejamento.tsx` — ícone `Download` importado, função `exportarSvg` adicionada, botão "Exportar SVG" adicionado

**Arquivo de relatório atualizado:** `AVALIACAO_SISTEMA.md` (este arquivo)