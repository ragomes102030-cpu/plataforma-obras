# Matriz Planilha × Sistema — Gap Analysis

> O que cada planilha **já representa** de valor vs o que o **produto (plataforma-obras)** precisa cobrir.  
> Sistema atual: app de obras (EAP, cronograma, Gantt, LOB, produção, medição, relatórios) com API tRPC + frontend.  
> **Análise somente — sem implementação.**

---

## 1. Legenda de cobertura no sistema

| Símbolo | Significado |
|---------|-------------|
| ✅ | Capacidade existente / alinhada |
| 🟡 | Existe parcialmente (gaps de campo/regra) |
| 🔴 | Ausente no sistema (gap) |
| ⚪ | Fora de escopo atual (confirmar) |

---

## 2. Matriz capacidade

| Domínio / capacidade | Sistema hoje | P1 ARES | P2 Template | P3 Profissional | Gap principal |
|----------------------|--------------|---------|-------------|-----------------|---------------|
| Cadastro de obra | 🟡 | CADASTRO completo | cabeçalho livre | RESUMO | endereço/cliente ricos, data-base única (C1) |
| Árvore de locais (torre/pav/ap) | 🟡/🔴 | ~245 LOCAL | — | rótulo pavimento | confirmar granularidade no produto |
| WBS / EAP 3 níveis | ✅ | EAP-001… | — | — | alinhar tipos DISCIPLINA/PACOTE/TRABALHO |
| EAP ciclo de vida pré-obra | 🔴 | — | física viabilidade→entrega | — | U2: entrar ou não |
| Categorias de custo (1001…) | 🟡 | grupos ORC implícitos | 4 dígitos explícitos | — | mapear taxonomia P2 |
| Frentes + tipo + status | ✅/🟡 | FRENTE-001…015 | — | labels | IDs + status no produto |
| Equipes | 🟡 | transitório → RECURSOS | responsável texto | Equipe A–D | modelo final de equipe |
| Serviço = EAP×FRENTE×LOCAL | 🟡/🔴 | regra P1 | — | — | se produto tem serviço composto |
| Orçamento itens + composição | 🟡 | ORÇAMENTO + Composicao | só taxonomia | — | BDI pendente (C10) |
| BDI TCU | 🔴 | fórmula + 0% | — | — | bloqueado por fonte |
| Recursos MO/EQP/MAT | 🟡 | RECURSOS | — | — | capacidade dia, custo unit |
| Cronograma fonte única | ✅ | PLANEJAMENTO 15 | tasks Gantt | CRONOGRAMA 14 | 3 códigos (C3) |
| Precedências FS + lag | 🟡/🔴 | REDE 17 | — | — | se CPM no produto |
| Caminho crítico | 🔴 | stub | — | — | P1 também stub |
| Gantt semanal | ✅ | GANTT | — | — | |
| Gantt diário 8 semanas + hoje | 🔴 | — | **template** | — | UX referência |
| Gantt mensal executivo | 🟡 | — | — | GANTT | escala config (C6) |
| Produção diária detalhada | ✅/🟡 | PRODUÇÃO completo | — | PRODUCAO mínimo | unificar granularidade |
| %Real via SUMIF produção | ✅/🟡 | via SERVIÇOS/IND | — | PRODUCAO→CRONOGRAMA | fluxo único |
| Medição por serviço | 🟡 | MEDIÇÃO | — | — | vs híbrido (C2) |
| Medição global parcelas | 🔴/🟡 | — | — | MEDICOES | **gap forte p/ padrão BR** |
| Dashboard KPIs financeiros | ✅/🟡 | DASHBOARD | — | DASHBOARD 6 KPIs | data-base/contrato (C1) |
| Contagem status % | ✅ | INDICADORES | — | DASHBOARD tabela | vocabulário (C4) |
| Indicadores + narrativa | 🟡 | 7 indicadores | — | — | revalidar (C7) |
| Curva S / planejado×real | 🟡 | GRÁFICOS | — | implícito | |
| Linha de balanço (LOB) | ✅ | 944 fórmulas | — | — | produto tem módulo LOB |
| Domínios controlados/listas | 🟡 | CONFIG 10 listas | — | — | portar enums |
| Unidades normalizadas | 🟡 | lista rica | — | m3/m2 strings | normalizador (C8) |
| Acessibilidade relatório | 🔴 | — | instruções template | — | UX |
| Proteção de template | ⚪ | — | SHA-512 | — | não portar |
| Responsável por tarefa | 🟡 | equipes/frentes | ATRIBUÍDO PARA | Equipe | modelo Pessoa |

---

## 3. Resumo de gaps por prioridade (sistema ← planilhas)

### 🔴 Gaps fortes (planilha tem, sistema fraco/ausente)
1. **Medição global com parcelas/saldo** (P3) — padrão contratual BR  
2. **Gantt diário UX** (P2) — janela 8 sem, destaque hoje  
3. **Ciclo de vida pré-obra** (P2) — se escopo aceito  
4. **Caminho crítico** (P1 stub) — roadmap  
5. **BDI com fonte** (P1 pendente) — bloqueio externo  
6. **Taxonomia 4 dígitos** (P2) — classificação de custos  
7. **Indicadores narrativos revalidados** (P1) — confiança  

### 🟡 Gaps médios (existe, mas não cobre regra/campo)
1. Serviço triângulo EAP×FRENTE×LOCAL (P1)  
2. Recursos + composição + capacidade dia  
3. Equipes modelo final (transitória vs recurso)  
4. Árvore LOCAL completa  
5. Precedências se CPM desejado  
6. Enums/Status unificados (C4)  
7. ID de cronograma estável (C3)  

### ✅ Já alinhado
- EAP/WBS básica  
- Frentes com tipo  
- Cronograma + Gantt semanal  
- Produção com colunas ricas  
- LOB  
- Dashboard base  

---

## 4. Planilha → módulo do sistema (roteiro de import/UX)

| Planilha | Aba | Módulo produto alvo | Ação |
|----------|-----|---------------------|------|
| P1 | CADASTRO | Cadastro obra / Locais | import estruturado |
| P1 | EAP | EAP | import |
| P1 | SERVIÇOS | Serviços/Catálogo | import + validação triângulo |
| P1 | FRENTES | Frentes/Equipes | import; migrar equipes |
| P1 | ORÇAMENTO | Orçamento | import; tratar erros; BDI opcional |
| P1 | RECURSOS | Recursos | import |
| P1 | PLANEJAMENTO | Cronograma | **fonte primária** cronograma |
| P1 | REDE | Cronograma/CPM | import precedências |
| P1 | GANTT | Gantt | view (deriva) |
| P1 | PRODUÇÃO | Produção | import/apontamento |
| P1 | MEDIÇÃO | Medições | import detalhe (C2) |
| P1 | LOB | Linha de balanço | view |
| P1 | INDICADORES/GRÁFICOS/DASH | Relatórios/KPIs | após C7 |
| P1 | FÓRMULAS/CONFIG | config/enums | portar listas |
| P1 | CAMINHO CRÍTICO/CONTROLE | — | backlog |
| P2 | Cronograma Gantt | Gantt (UX diária) | referência UI |
| P2 | EAP Física | (opcional fases) | decisão U2 |
| P2 | EAP Orçamento | Categorias custo | tabela de mapeamento |
| P2 | Sobre | — | ignorar |
| P3 | RESUMO/DASH | Relatório mensal | view |
| P3 | CRONOGRAMA | Cronograma (códigos 01.01) | import / espelho |
| P3 | GANTT | Gantt mensal | escala config |
| P3 | MEDICOES | Medições | **import global** |
| P3 | PRODUCAO | Produção | import / espelho P1 |

---

## 5. Conflitos que afetam import (ver `conflitos.md`)

| Import riscado sem decisão | Conflito |
|----------------------------|----------|
| Valores de contrato/data-base | C1 |
| MEDIÇÃO P1 + MEDICOES P3 juntos | C2 |
| IDs de atividade P1×P3 | C3 |
| Status strings | C4 |
| EAP P2 orçamento vs WBS | C5 |
| Unidades m² vs m2 | C8 |
| KPIs calculados | C7, C9, C10 |

---

## 6. Próximo

1. Decidir `regras-conflitantes.md`  
2. Executar fases de `plano-implementacao.md`  
3. Importadores e schema — **após confirmação do usuário**
