# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @taskflow/api...
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @taskflow/api build \
 && pnpm --filter @taskflow/api deploy --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/package.json ./
# Run as non-root.
USER node
EXPOSE 4000
# One process per container; scale with replicas (one per core), not with in-process clustering.
CMD ["node", "--import", "./dist/common/otel.js", "dist/server.js"]
