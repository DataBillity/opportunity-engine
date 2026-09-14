FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker ./apps/worker
COPY packages ./packages

RUN pnpm install --frozen-lockfile --filter @opportunity-engine/worker...

ENV NODE_ENV=production

EXPOSE 3000
CMD ["pnpm", "--filter", "@opportunity-engine/worker", "exec", "tsx", "src/index.ts"]
