# Observabilidade — erros 5xx e conjunto dourado

Duas peças da Fase 0: enxergar falha de servidor sem depender de SaaS e provar que
o motor de cronograma continua reproduzindo a obra aprovada.

## 1. Erros 5xx (`error_events`)

### O que entra

| Origem | Como é capturado | Exemplo |
|---|---|---|
| tRPC | `onError` do adapter, apenas `INTERNAL_SERVER_ERROR` | procedure que lança exceção |
| Express | middleware final de erro | JSON inválido, falha em rota não-tRPC |

Erros 4xx (validação, não autorizado) **não** entram: são fluxo esperado e virariam
ruído. Se um dia forem necessários, crie uma segunda tabela — não misture.

Cada linha guarda: `fingerprint`, `origem`, `rota` (sem query string), `metodo`,
`status`, `codigo`, `mensagem`, `stack`, `userId`, `commitSha`, `createdAt`.

O `fingerprint` é `sha256(origem | rota | codigo | primeiro frame da stack)`, com
números de linha e coluna normalizados. O mesmo erro em builds diferentes cai no
mesmo grupo; rotas diferentes caem em grupos diferentes.

### Variáveis de ambiente

| Variável | Obrigatória | Efeito |
|---|---|---|
| `OPS_TOKEN` | não | Habilita `GET /internal/ops/errors?token=...`. Sem ela, o endpoint responde 404 |
| `ALERT_WEBHOOK_URL` | não | Envia alerta para Slack/Discord na primeira ocorrência de cada grupo a cada 15 min |

Sem as duas, a captura continua gravando no banco — só não há leitura remota nem
push. Para ligar o alerta, crie um webhook de entrada no canal de operação e
configure a URL no Render (`plataforma-obras-3` → Environment). Variável nova
exige um novo deploy para valer.

### Ler os erros

```bash
curl "https://plataforma-obras-3.onrender.com/internal/ops/errors?token=$OPS_TOKEN"
```

Resposta: `grupos` (últimas 24 h, agrupado por fingerprint, com contagem) e
`ultimos` (50 ocorrências cruas, mais recentes primeiro).

Por SQL:

```sql
select rota, codigo, count(*) as n, max("createdAt") as ultima
  from error_events
 where "createdAt" > now() - interval '24 hours'
 group by 1,2 order by n desc;

select "createdAt", rota, mensagem, "commitSha"
  from error_events order by "createdAt" desc limit 50;
```

### Quando o alerta tocar (runbook)

1. Confira `commitSha` do alerta contra `/healthz` (`commit`). Se forem diferentes,
   o build já mudou: veja se o erro persiste.
2. `GET /readyz` — se `database` não estiver `ok`, o problema é infraestrutura, não
   código.
3. Repita a rota que falhou com o usuário afetado. Se for reproduzível e nova,
   priorize correção; se for intermitente, veja `grupos` por horário.
4. Rollback é por commit: reverter a `main` e deixar o Render reconstruir (ou
   disparar o deploy pela API — ver `docs/DEPLOY.md`). Não existe deploy
   azul/verde: o build leva alguns minutos, então corrija para frente quando o
   impacto for baixo.

### Retenção

Não há limpeza automática. Sugestão: manter 90 dias e apagar o resto por rotina
mensal (`delete from error_events where "createdAt" < now() - interval '90 days'`).
Enquanto o volume for de dezenas por dia, não é problema.

## 2. Conjunto dourado da Aurora (`aurora-cpm-golden`)

O teste `server/construction/aurora-cpm-golden.test.ts` lê
`tests/fixtures/aurora-v3-cpm.json` — retrato da **v3 aprovada** da AURORA TESTE
(53 atividades, 64 dependências) — e recomputa o CPM do zero. Ele falha se:

- qualquer data, folga ou marcação de crítico divergir do que está persistido;
- aparecer dependência órfã, laço ou atividade duplicada;
- o resultado deixar de ser determinístico.

Atualizar o fixture é ato deliberado (o cronograma mudou de verdade):

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/exportar-aurora-cpm.mjs
pnpm exec vitest run server/construction/aurora-cpm-golden.test.ts
git diff tests/fixtures/aurora-v3-cpm.json   # revise antes de commitar
```

Nunca ajuste o valor esperado para o teste passar. Se o motor mudou e a mudança é
correta, o diff do fixture é a evidência da mudança — e deve ser revisado como
código.

## 3. O que ainda falta nesta camada

- Métricas de custo/tokens por execução do agente (`agent_runs` não tem esses campos).
- Duração por ferramenta nos eventos (`agent_run_events` não grava `durationMs`).
- Painel visual; hoje a leitura é endpoint + SQL.
- Alerta de fila/latência do agente (só existe alerta de 5xx).
- Substituir ou complementar por Sentry quando houver orçamento: o ganho seria
  source map e breadcrumb, não a captura em si.
