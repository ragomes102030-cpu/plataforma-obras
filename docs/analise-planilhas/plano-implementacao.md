# Plano de Implementação por Prioridade (Análise → Código)

> **Status**: PROPOSTO — não iniciado.  
> **Gate**: Fase 0 (8 decisões em `regras-conflitantes.md`) **deve** ser aprovada antes de qualquer código.  
> Nenhum código do sistema foi alterado por esta análise.

---

## Fase 0 — Decisões (bloqueante, humano)

| ID | Decisão | Desbloqueia |
|----|---------|-------------|
| D1 | data-base + contrato oficiais (C1) | schema Obra, KPIs, fixtures |
| D2 | medição global / por serviço / híbrido (C2) | schema Medicao(+Item), imports |
| D3 | IDs estáveis + WBS=P1 (C3, C5) | import cronograma, FKs |
| D4 | enums de status (C4) | UI, migração, validação |
| D5 | escala Gantt (C6) | UI Gantt |
| D6 | pré-obra sim/não (P2-U2) | Fases/escopo |
| D7 | categorias de custo P2 (C5) | orçamento |
| D8 | modelo de equipes (P1 transitório) | recursos |

**Saída**: `regras-conflitantes.md` com todos os `DECISÃO:` preenchidos.

---

## Fase 1 — Schema canônico (alta)

Baseado em `modelo-dominio.md`.

| Item | Origem | Critério de pronto |
|------|--------|--------------------|
| 1.1 `Obra`, `Local` (árvore) | P1 CADASTRO | CRUD + hierarquia validada |
| 1.2 `Eap` (3 tipos, pai) | P1 EAP | CRUD + contagem serviços |
| 1.3 `Frente` (tipo, status) | P1 FRENTES | CRUD |
| 1.4 `Servico` (triângulo + derivados) | P1 SERVIÇOS | FK EAP×FRENTE×LOCAL; warning duplicata; valor_contratado calculado |
| 1.5 Enums + `Unidade` + aliases | P1 CONFIG + C8 | `m²`≡`m2`; listas centralizadas |
| 1.6 `Atividade` + `Precedencia` | P1 PLANEJAMENTO/REDE + P3 campos | id interno + codigo_exibicao; duração/produtividade derivadas |
| 1.7 `Producao` | P1 (+ min P3) | FK serviço/atividade; acumulado derivado |
| 1.8 `Medicao` conforme **D2** | P3 global + P1 detalhe | schema aprovado em D2 |
| 1.9 `Recurso`, `Composicao` | P1 RECURSOS/ORÇ | custo unit, capacidade |
| 1.10 `OrcamentoItem` (+ `CategoriaOrcamento` se D7=A) | P1 + P2 | derivados não editáveis |

**Evidência**: migrações + testes de integridade (triângulo, derivados, enums).

---

## Fase 2 — Pipeline de carga / import (alta)

| Item | Origem | Critério |
|------|--------|----------|
| 2.1 Normalizador de unidades | C8 | `m3`→`m3` canônico |
| 2.2 Mapeador de códigos P3 (`01.01`) → Atividade | C3 | tabela de mapeamento |
| 2.3 Mapeador P2 categorias → CategoriaOrcamento | D7 | se aplicável |
| 2.4 Validador FKs + duplicatas | P1 regras | erros/warnings estruturados |
| 2.5 Recálculo de fórmulas P1 **antes** de confiar em valores | C9 | abrir em Excel/LO ou engine de cálculo; não usar cache CLI |
| 2.6 Import P1 PLANEJAMENTO como fonte cronograma | P1 | carga completa 15 atividades |
| 2.7 Import P3 MEDICOES/PRODUCAO (se D2/D1 ok) | P3 | carga amostra |

**Evidência**: fixture de import + relatório de erros zero em amostra limpa.

---

## Fase 3 — Cronograma + Gantt (média)

| Item | Origem | Critério |
|------|--------|----------|
| 3.1 Status engine (fórmula P1 col Q + D4) | P1 + D4 | statuses manuais preservados |
| 3.2 Precedências → cálculo de janelas | P1 REDE | lag FS aplicado |
| 3.3 Gantt escala conforme **D5** | P2 diária + P1 semanal + P3 mensal | viewport 8 semanas + hoje (P2-U1) |
| 3.4 %Real via produção (fluxo único) | P3 SUMIF / P1 | pipeline produção→% |

**Evidência**: cronograma de amostra com status, barras, hoje destacado.

---

## Fase 4 — Orçamento / BDI / recursos (média, parcialmente bloqueada)

| Item | Origem | Gate |
|------|--------|------|
| 4.1 Composição custo unit | P1 | Fase 1.9 |
| 4.2 BDI TCU | P1-U4 | **D1/C10 — % com fonte** (nunca default 0 silencioso) |
| 4.3 Valor orçado/contratado derivados | P1 regras | Fase 1 |
| 4.4 Necessidade serviço×recurso | P1-U15 | Fase 1.9 |

---

## Fase 5 — Medições + indicadores (média, gate D1/D2/C7)

| Item | Origem | Critério |
|------|--------|----------|
| 5.1 Telas medição conforme **D2** | P3 + P1 | parcela/saldo/% e/ou por serviço |
| 5.2 Dashboard KPIs financeiros | P3 DASHBOARD | data-base/contrato = D1 |
| 5.3 Contagem por status | P3 | enums = D4 |
| 5.4 Indicadores narrativos **revalidados** | P1 INDICADORES + C7 | valor = narrativa nos testes |
| 5.5 Gráficos planejado×real / produção | P1 GRÁFICOS | export relatório |

**Evidência**: screenshot KPIs batem com planilha recalculada.

---

## Fase 6 — LOB + roadmap (baixa)

| Item | Origem | Critério |
|------|--------|----------|
| 6.1 Linha de balanço (alinhar spec P1 944 fórmulas) | P1 LOB | módulo existente vs spec P1 |
| 6.2 Caminho crítico (P1 stub → implementar) | P1-U3 | algoritmo CPM + UI |
| 6.3 Stub CONTROLE | P1-U17 | definir escopo ou descartar |

---

## Fase 7 — UX enriquecida (baixa)

| Item | Origem |
|------|--------|
| 7.1 Instruções a11y de relatório | P2-U5 |
| 7.2 Progresso/responsável por tarefa | P2-U4 |
| 7.3 Pré-obra fases | P2-U2 se **D6=B** |
| 7.4 Template relatório semanal | P2-U7 |

---

## Ordem resumida (após D0)

```
F0 decisões → F1 schema → F2 import
                 ↓
              F3 cronograma/Gantt ──→ F5 medições/KPIs
                 ↓
              F4 orçamento/BDI (se fonte) → F6 LOB/CPM → F7 UX
```

---

## Explicitamente fora / não fazer

- Não portar proteção SHA-512 (P2-U8)
- Não confiar em caches CLI sem recalcular (C9)
- Não implementar UI P0/P1/P2 do audit de interface **sem confirmação do usuário** (pendência separada)
- Não commitar scripts `offline-match.ts` / `offline-reconcile.ts`
- Não defaultar BDI=0

---

## Rastreabilidade

| Entregável da análise | Arquivo |
|----------------------|---------|
| Matriz comparativa | `docs/MATRIZ_COMPARATIVA_3_PLANILHAS.md` |
| Auditorias P1/P2/P3 | `docs/analise-planilhas/auditoria-p*.md` |
| Conflitos | `docs/analise-planilhas/conflitos.md` |
| Modelo domínio | `docs/analise-planilhas/modelo-dominio.md` |
| Planilha×Sistema | `docs/analise-planilhas/matriz-planilha-sistema.md` |
| Exclusivos | `docs/analise-planilhas/funcionalidades-unicas.md` |
| 8 decisões | `docs/analise-planilhas/regras-conflitantes.md` |
| Este plano | `docs/analise-planilhas/plano-implementacao.md` |
