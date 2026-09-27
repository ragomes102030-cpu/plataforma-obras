# ROADMAP.md — Roteiro de Trabalho

## LEGENDA

| Prioridade | Significado |
|------------|-------------|
| AGORA | Bloqueia confiabilidade ou funcionalidade essencial |
| DEPOIS | Melhoria importante, não bloqueante |
| EXPERIMENTO | Pode ser útil, preciso testar antes de decidir |
| DESCARTADO | Não vou fazer (analisado) |

---

## AGORA — Bloqueia confiabilidade

1. **Corrigir teste de OAuth** — Atualizar `github-oauth.test.ts` para usar Vercel URL
2. **Validar Gantt em navegador** — Abrir sistema, criar obra, verificar Gantt funciona
3. **Validar LOB em navegador** — Verificar Linha de Balanço renderiza corretamente
4. **Validar Curva S em navegador** — Verificar curva atualiza com produção

---

## DEPOIS — Melhoria importante

1. **Calcular duração automaticamente** — Quando quantidade e produtividade são informados, calcular durationDays = quantidade / produtividade automaticamente
2. **DHTMLX Gantt** — Avaliar substituição do SVG custom por DHTMLX Community (se necessário para performance)
3. **Leveling de recursos** — Detectar conflitos de equipe no mesmo período
4. **Onboarding do usuário** — Guia introdutório para novo usuário
5. **Atualização em tempo real da Curva S** — Re-query após confirmar produção

---

## EXPERIMENTO — Testar antes de decidir

1. **Integração com MCP externos** — Conectar com MCP cronograma, EAP, Gantt/LOB externos
2. **IA para planejamento inicial** — Usar agente IA para sugerir atividades, dependências, durações baseadas no EAP
3. **Fórmulas avançadas de orçamento** — Calcular BDI, PIS, COFINS, impostos automaticamente a partir de porcentagens configuráveis

---

## DESCARTADO

Nenhum.

---

## OBRAS DE TESTE

Serão criadas 3 obras permanentes:

| Código | Nome | Complexidade | Qtd atividades estimada |
|--------|------|--------------|------------------------|
| QA-01 | Residência Unifamiliar 120m² | Pequena | ~10-15 atividades |
| QA-02 | Residencial Multifamiliar 2000m² | Média | ~30-50 atividades |
| QA-03 | Complexo Residencial 3 blocos | Grande | ~100+ atividades |

Estas obras NÃO devem ser excluídas. Elas servem como base de regressão.

---

Versão: 1.0
Data: 2026-09
