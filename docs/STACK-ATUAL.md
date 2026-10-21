# Stack atual

Verificado em **2026-10-21**, contra produção (`/healthz` e `/readyz` do Render) e
contra o repositório em `main`. Este arquivo é a fonte de verdade sobre *onde* o
sistema roda. Se outro documento disser outra coisa, este ganha — e o outro
documento está desatualizado.

## Em uma linha

**GitHub (código) → Render, serviço `plataforma-obras-3` (build e runtime) →
Supabase (PostgreSQL). Nada além disso.**

## Componentes

| Camada | O que é | Onde |
| --- | --- | --- |
| Código | repo `ragomes102030-cpu/plataforma-obras`, branch `main` | GitHub |
| Build | **Dockerfile** (o serviço está configurado com `env: docker` no Render) | Render |
| Runtime | `npm start` → `migrate && audit && node dist/index.js` | Render |
| URL de produção | `https://plataforma-obras-3.onrender.com` | Render |
| Serviço Render | `srv-dbcd0gon74is7384ufag` | Render |
| Banco | PostgreSQL gerenciado (projeto `tromrvfijbtihuilvnuk`) | Supabase |
| Front-end | React + Vite 7, buildado e servido pelo próprio Express | mesma imagem |
| Toolchain | Node 22, **pnpm 10.34.5** (mesmo valor em `packageManager`, `Dockerfile`, `nixpacks.toml` e workflows) | build |
| Dependências | `pnpm audit --prod` = 0 vulnerabilidade conhecida | build |
| API | Express + tRPC em `/api/trpc`; OAuth em `/api/auth/github` | mesma imagem |
| CI | `CI` + `schema-audit` (por PR) e `Deploy verify (Render)` (por push) | GitHub Actions |

**Só existe UM serviço no Render.** Os outros três (`srv-db8cq2on74is73ekdmgg`,
`srv-db8crk689jmc73d2cchg`, `srv-db8cta0m7kps73dujt2g`) foram apagados em
2026-10-21. Apagar um serviço do Render **não apaga o banco**: o PostgreSQL é do
Supabase e continua no lugar.

O commit publicado se confere em `GET /healthz`:

```bash
curl -s https://plataforma-obras-3.onrender.com/healthz
# {"ok":true,"service":"plataforma-obras-api","commit":"<sha>","environment":"production",...}
```

Se o `commit` não for o último de `main`, o deploy não aconteceu — não importa o
que o painel diga. O workflow `Deploy verify (Render)` faz exatamente essa
pergunta depois de cada push e falha quando a resposta é "não".

## Banco

- **38 tabelas de domínio** declaradas em `drizzle/schema.ts` (`pgTable(...)`).
- **39** é o número que o `/readyz` devolve: as 38 + `"__drizzle_migrations"`.
- **15 migrações** em `drizzle/meta/_journal.json` (da `0000_baseline` à
  `0015_cost_entries`).

```bash
curl -s https://plataforma-obras-3.onrender.com/readyz
# {"ok":true,"database":"ok","tabelas":39,"jwtSecretConfigurado":true,"warnings":[]}
```

`/readyz` é a prova de que a cadeia de boot inteira rodou: ele só responde `200`
se o banco responde e o schema foi migrado. `warnings` vazio é o esperado.

## O que **não** faz parte do sistema

Estas plataformas apareceram no projeto em algum momento e **não são mais
usadas**. Documento que as apresente como stack atual está errado:

| Fora | Por quê |
| --- | --- |
| **DockHosting** (`plataforma-obras.dockhosting.dev`) | foi o alvo de deploy por um período e **ficou no ar servindo um commit antigo**. Hoje o alvo é o Render. Se o host ainda responder, ele não é produção: é sobra, e deve ser desligado. |
| **Vercel** (`vercel.json`, `.vercel/`) | projeto é um servidor Express, não função/site estático; `vercel.json` não existe mais |
| **Aiven** | era o host do MySQL; o banco é Supabase/PostgreSQL |
| **MySQL** (`mysql2`, `drizzle-orm/mysql-core`) | substituído por PostgreSQL (`pg`, `drizzle-orm/pg-core`) na migração Supabase |
| **Railway** | nunca foi usado de fato; só apareceu em plano de contingência, mas o health-check do CI apontou para lá por um tempo |

O histórico dessas decisões está em `docs/DECISIONS.md`. Os documentos de
planejamento e os relatórios datados que ainda as citam ganharam um aviso no
topo: são **registros da época**, não instruções.

## Onde está o resto

- Deploy, variáveis de ambiente, runbook de incidente: `docs/DEPLOY.md`
- Decisões e o porquê de cada migração: `docs/DECISIONS.md`
- Arquitetura de código: `docs/ARCHITECTURE.md`
- Modelo de dados: `docs/DATA_MODEL.md`
- Estado do planejamento (EAP/Gantt): `docs/PLANO-EXPANSAO-PLANEJAMENTO.md`
- Sincronização `main` ↔ `develop`: `docs/SINCRONIZACAO-MAIN-DEVELOP.md`

## Regra para quem escrever documentação aqui

Não descrever infraestrutura de terceiros que o projeto não usa. A tentação é
copiar instrução de tutorial ("faça o deploy no Render/Vercel/DockHosting") e o
resultado é alguém procurando um botão que não existe. Se precisar citar uma
plataforma antiga, cite como **histórico** e aponte para este arquivo.
