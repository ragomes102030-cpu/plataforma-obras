# Stage 1: Build frontend
FROM node:22-slim AS frontend-build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY client/ ./client/
COPY server/ ./server/
COPY shared/ ./shared/
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Stage 2: Build and run backend + serve static
FROM node:22-slim
WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY server/ ./server/
COPY shared/ ./shared/
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend
COPY --from=frontend-build /app/dist/public ./dist/public

# Build server
RUN pnpm build

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["pnpm", "start"]
