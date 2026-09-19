# Plataforma Obras

MVP de uma plataforma web multiobras para planejamento e controle de obras. O primeiro corte reúne portfólio, obras, atividades, Gantt visual, indicadores e um motor CPM determinístico preparado para crescer para Linha de Balanço, avanço físico, restrições e auditoria.

## Estado atual

- Painel multiobras com duas obras demonstrativas.
- EAP visual recolhível por fase.
- Gantt com status, datas relativas, progresso e criticidade.
- Tema visual neutro, com baixo contraste e leitura operacional.
- Schema inicial de `projects` e `schedule_activities` em Drizzle/MySQL.
- API tRPC para listar obras e atividades.
- Motor CPM puro em `shared/cpm.ts`.
- Testes de relações FS/SS, lag e detecção de ciclos.
- CI em GitHub Actions.
- Configurações iniciais para Vercel e Render.

## Executar localmente

```bash
pnpm install
pnpm dev
```

Verificação:

```bash
pnpm check
pnpm test --run
pnpm build
```

## Arquitetura

```text
client/       interface React/Vite
server/       API Express + tRPC + autenticação
shared/       regras determinísticas reutilizáveis
server/db.ts  acesso Drizzle ao banco
```

O próximo passo técnico é separar o motor CPM/LOB em uma biblioteca de domínio versionada e adicionar relações de dependência, calendários, baselines, medições, restrições e Linha de Balanço ao schema.

## Deploy

O repositório pode ser conectado à Vercel para o front-end e ao Render para o serviço web do backend. O arquivo `render.yaml` é um blueprint inicial. Antes de operação real, configurar `DATABASE_URL`, autenticação, domínio, CORS/rewrite, storage de arquivos e banco gerenciado. Não commitar segredos.

## Importante

Os dados exibidos inicialmente são demonstrativos e servem para validar a interface. Eles não representam medições oficiais nem devem ser usados para decisões contratuais até a importação da base real e a configuração dos calendários do projeto.
