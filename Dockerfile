# Base stage
FROM node:26-alpine AS base
RUN apk update && apk add bash
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# All deps stage
FROM base AS build-deps
WORKDIR /usr/app
ADD ./package.json ./pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Prod deps stage
FROM base AS prod-deps
WORKDIR /usr/app
ADD ./package.json ./pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Build stage
FROM base AS build
WORKDIR /usr/app
COPY --from=build-deps /usr/app/node_modules /usr/app/node_modules
ADD . .
RUN pnpm build

# Production stage
FROM base AS app
ENV NODE_ENV=production
WORKDIR /usr/app
COPY --from=prod-deps /usr/app/node_modules /usr/app/node_modules
COPY --from=build /usr/app/package.json /usr/app/package.json
COPY --from=build /usr/app/dist /usr/app/dist
COPY --from=build /usr/app/tsconfig.json /usr/app/tsconfig.json
COPY --from=build /usr/app/tsconfig.build.json /usr/app/tsconfig.build.json
COPY --from=build /usr/app/src/database/interfaces /usr/app/src/database/interfaces
COPY --from=build /usr/app/src/database/migrations /usr/app/src/database/migrations
COPY --from=build /usr/app/src/database/seeds /usr/app/src/database/seeds
# kysely-ctl's config (DB connection + migrationFolder) — required by
# `pnpm migrate:latest`, which the ECS one-off migrate task runs.
# Without it the CLI can't find its config and migrations never apply.
COPY --from=build /usr/app/.config /usr/app/.config
EXPOSE 5100
CMD ["pnpm", "start:build"]
