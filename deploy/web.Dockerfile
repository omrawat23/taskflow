# syntax=docker/dockerfile:1
# Builds the React app and serves it with nginx, which also reverse-proxies /api to the API
# so auth cookies stay first-party.
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @taskflow/web...
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @taskflow/web build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
