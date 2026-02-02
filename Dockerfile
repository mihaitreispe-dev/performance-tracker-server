# Base stage
FROM node:20.15.1-alpine3.20 AS base
RUN apk update && apk add bash

# All deps stage
FROM base AS build-deps
WORKDIR /usr/app
ADD ./package*.json .
ADD ./yarn.lock .
RUN yarn install --frozen-lockfile

# Prod deps stage
FROM base AS prod-deps
WORKDIR /usr/app
ADD ./package*.json .
ADD ./yarn.lock .
RUN yarn install --frozen-lockfile

# Build stage
FROM base AS build
WORKDIR /usr/app
COPY --from=build-deps /usr/app/node_modules /usr/app/node_modules
ADD . .
RUN yarn build

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
EXPOSE 3000
CMD ["yarn", "start:build"]
