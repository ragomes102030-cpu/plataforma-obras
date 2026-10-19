# Stack atual

Verificado em **2026-10-19**, contra produção (`/healthz` e `/readyz`) e contra o
repositório em `main`. Este arquivo é a fonte de verdade sobre *onde* o sistema
roda. Se outro documento disser outra coisa, este ganha — e o outro documento
está desatualizado.

## Em uma linha

**GitHub (código) → DockHosting (build e runtime) → Supabase (PostgreSQL).
Nada além disso.**

## Componentes

| Camada | O que é | Onde |
| --- | --- | --- |
| Código | repo `ragomes102030-cpu/plataforma-obras`, branch `main` | GitHub |
| Build | Nixpacks, lido de `nixpacks.toml` (Node 22, pnpm 10.4.1) | DockHosting |
| Runtime | `npm start` → `migrate && audit && node dist/index.js` | DockHosting |
| URL de produção | `https://plataforma-obras.dockhosting.dev` | DockHosting |
| Banco | PostgreSQL gerenciado (projeto `tromrvfijbtihuilvnuk`) | Supabase |
| Front-end | React + Vite 7, buildado e servido pelo próprio Express | mesma imagem |
| API | Express + tRPC em `/api/trpc`; OAuth em `/api/auth/github` | mesma imagem |
| CI | `validate` + `schema-audit` (por PR) e `deploy-verify` (por push) | GitHub Actions |

O commit publicado se confere em `GET /healthz`:

```bash
curl -s https://plataforma-obras.dockhosting.dev/healthz
# {"ok":true,"service":"plataforma-obras-api","commit":"<sha>","environment":"production",...}
```

Se o `commit` não for o último de `main`, o deploy não aconteceu — não importa o
que o painel diga.

## Banco

- **36 tabelas de domínio** declaradas em `drizzle/schema.ts` (`pgTable(...)`).
- **37** é o número que o `/readyz` devolve: as 36 + `"__drizzle_migrations"`.
- **13 migrações** em `drizzle/meta/_journal.json` (da `0000_baseline` à
  `0012_project_cub_bdi_declarados`).

```bash
curl -s https://plataforma-obras.dockhosting.dev/readyz
# {"ok":true,"database":"ok","tabelas":37,"jwtSecretConfigurado":true,"warnings":[]}
```

`/readyz` é a prova de que a cadeia de boot inteira rodou: ele só responde `200`
se o banco responde e o schema foi migrado. `warnings` vazio é o esperado.

## O que **não** faz parte do sistema

Estas plataformas apareceram no projeto até a migração para Supabase + DockHosting
e **não são mais usadas**. Documento que as apresente como stack atual está
errado:

| Fora | Por quê |
| --- | --- |
| **Render** (`render.yaml`, `onrender.com`) | substituído pelo DockHosting; `render.yaml` não existe mais |
| **Vercel** (`vercel.json`, `.vercel/`) | projeto é um servidor Express, não função/site estático; `vercel.json` não existe mais |
| **Aiven** | era o host do MySQL; o banco é Supabase/PostgreSQL |
| **MySQL** (`mysql2`, `drizzle-orm/mysql-core`) | substituído por PostgreSQL (`pg`, `drizzle-orm/pg-core`) na migração Supabase |
| **Railway** | nunca foi usado de fato; só apareceu em plano de contingência |

O histórico dessas decisões está em `docs/DECISIONS.md`. Os documentos de
planejamento e os relatórios datados que ainda as citam ganharam um aviso no
topo: são **registros da época**, não instruções.

## Onde está o resto

- Deploy, variáveis de ambiente, runbook de incidente: `docs/DEPLOY-DOCKHOSTING.md`
- Decisões e o porquê de cada migração: `docs/DECISIONS.md`
- Arquitetura de código: `docs/ARCHITECTURE.md`
- Modelo de dados: `docs/DATA_MODEL.md`
- Estado do planejamento (EAP/Gantt): `docs/PLANO-EXPANSAO-PLANEJAMENTO.md`

## Regra para quem escrever documentação aqui

Não descrever infraestrutura de terceiros que o projeto não usa. A tentação é
copiar instrução de tutorial ("faça o deploy no Render/Vercel") e o resultado é
alguém procurando um botão que não existe. Se precisar citar uma plataforma
antiga, cite como **histórico** e aponte para este arquivo.
