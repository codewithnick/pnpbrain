FROM node:20-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

# Copy the workspace manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/tools/package.json packages/tools/package.json
COPY packages/types/package.json packages/types/package.json

# Install workspace dependencies (includes tsx, used for runtime in this monorepo)
RUN pnpm install --frozen-lockfile

# Copy the backend app and its shared workspace packages
COPY apps/backend apps/backend
COPY packages packages

# Verify the backend still compiles during the image build
RUN pnpm --filter backend build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["pnpm", "--dir", "apps/backend", "exec", "tsx", "src/server.ts"]
