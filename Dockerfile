# syntax=docker/dockerfile:1
# Multi-stage build: install deps -> build Next.js (standalone) -> small runtime image.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm build:worker && pnpm build:seed && pnpm build:import

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Full production node_modules so migrate/seed scripts have everything they import.
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app drizzle ./drizzle
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app scripts ./scripts
USER app
EXPOSE 3000
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
