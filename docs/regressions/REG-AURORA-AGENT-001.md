# REG-AURORA-AGENT-001 — Arquimedes autônomo + fallback local + Playwright

## Objetivo

Garantir o fluxo Arquimedes → EAP → MCP preferencial → fallback local → fonte canônica → UI para uma ordem operacional em linguagem natural.

## Falhas encontradas

1. O chat não repassava localProjectId ao orquestrador.
2. Os mapeamentos MCP não eram resolvidos automaticamente.
3. O MCP-EAP retornava 404 para Aurora apesar da EAP existir na fonte local.
4. O fallback local não recebia userId.
5. A criação usava Date.now() em sortOrder, mas a coluna PostgreSQL é integer; isso causava overflow no INSERT.
6. A leitura MCP continuava divergente da fonte canônica.

## Resultado live

- Render: deploy LIVE no commit 331c7b82590db8935e90d83ed3ad6501c677a8a8.
- Playwright: executou o fluxo autenticado real na Aurora.
- MCP-EAP: continuou retornando 404 para a obra.
- Fallback local: executado.
- Supabase canônico confirmou a atividade Teste Playwright Aurora INSERT OK: projectId 7, versionId 8, wbsCode/eapRef 1.1.2, durationDays 1.
- UI Aurora passou a mostrar 4 atividades, incluindo a atividade de teste com 1d e EAP 1.1.2.

## Critério de aprovação

1. Ordem executada sem segunda confirmação.
2. MCP sem contexto → Arquimedes usa fonte local.
3. Gravação na fonte canônica.
4. Atividade reaparece na UI.
5. Nome, duração e EAP/WBS confirmados.

## Execução

Variáveis: PLAYWRIGHT_BASE_URL, PLAYWRIGHT_STORAGE_STATE, PLAYWRIGHT_E2E_MUTATE=1.
Opcional: PLAYWRIGHT_ACTIVITY_NAME.
Comando: pnpm e2e:aurora.

## Observação

A atividade criada é artefato de QA. Antes de homologar a Aurora como obra real, precisamos de estratégia de limpeza ou obra de validação para regressões mutáveis.