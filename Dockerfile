# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build
# Gera os DOIS artefatos em /app/dist:
#   dist/public/**  <- vite build  (root=client/, outDir=dist/public)
#   dist/index.js   <- esbuild     (bundle ESM de server/_core/index.ts)
# ---------------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# `playwright` esta em dependencies (so por causa dos scripts de e2e) e o
# postinstall dele baixa o Chromium inteiro. Nem server/ nem shared/ usam
# playwright, entao nao ha motivo para pagar esse download no build.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# pnpm-workspace.yaml declara `patchedDependencies` apontando para
# patches/wouter@3.7.1.patch — o arquivo precisa estar presente ANTES do
# install, senao o pnpm falha ao aplicar o patch.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ ./patches/

# vite.config.ts define `root: client/`, `outDir: dist/public` e os aliases
# @/@shared/@assets. Sem ele o `vite build` assume root=/app, nao acha o
# index.html (que vive em client/) e aborta. tsconfig.json e o mesmo para os
# path mappings que o esbuild e o tsc leem.
COPY vite.config.ts tsconfig.json ./
COPY client/ ./client/
COPY server/ ./server/
COPY shared/ ./shared/

# server/db.ts, routers.ts, agent-execution.ts e llm-settings.ts importam
# ../drizzle/schema. Sem esse diretorio o esbuild aborta o bundle do servidor.
COPY drizzle/ ./drizzle/

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile
RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# Apenas dependencias de producao + o dist/ ja construido.
#
# NAO roda `pnpm build` aqui de proposito:
#   1. `vite build` usa root=client/ e o client/ nao e copiado neste stage
#   2. `emptyOutDir: true` no vite.config.ts apagaria o dist/public copiado
#   3. vite/esbuild sao devDependencies e este stage instala so --prod
# O stage 1 ja produz os dois artefatos, entao eles vem prontos.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app

# NODE_ENV=production e o que faz server/_core/index.ts escolher
# serveStatic() em vez de setupVite(). Sem isso o servidor tenta subir o Vite.
ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ ./patches/
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --prod

# server/_core/vite.ts resolve distPath como <dirname do bundle>/public,
# e o bundle vive em dist/ — entao o front precisa estar em dist/public.
COPY --from=build /app/dist ./dist

# Bootstrap de banco vazio (staging / recuperacao). Nao roda sozinho: so quando
# o comando de start do servico o chama; em producao o CMD abaixo nao o usa.
COPY scripts/bootstrap-db.mjs ./scripts/bootstrap-db.mjs
COPY drizzle/full-schema.sql ./drizzle/full-schema.sql

EXPOSE 3000
CMD ["pnpm", "start"]
