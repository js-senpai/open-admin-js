FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm --filter @openadminjs/brand build && pnpm --filter @openadminjs/api... build && pnpm --filter @openadminjs/admin build
RUN mkdir -p /app/storage /app/apps/api/logs && chown -R node:node /app
USER node
ENV NODE_ENV=production
EXPOSE 3000 4000
CMD ["pnpm","--filter","@openadminjs/api","start"]
