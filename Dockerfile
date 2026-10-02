# syntax=docker/dockerfile:1
# Self-hosting images for Learn Wren (US-09-04). Two runtime targets, one build
# context; docker-compose.yml picks the target per service.
#
#   builder   — installs the workspace and builds web + api once
#   api       — NestJS api in listen mode (node dist/apps/api/main.js)
#   web       — nginx serving the Angular build, proxying /api to the api

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /src
ENV NX_DAEMON=false CI=true
RUN corepack enable
COPY . .
RUN corepack prepare --activate && pnpm install --frozen-lockfile
RUN pnpm exec nx run-many -t build -p web,api

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS api
WORKDIR /app
COPY --from=builder /src/dist/apps/api ./
# The Nx build emits a package.json listing only the runtime dependencies the
# bundle needs (firebase-admin, sharp, ffprobe, ...). npm (not pnpm) so the
# native prebuilds resolve without the root's onlyBuiltDependencies policy.
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force \
  # @ffprobe-installer ships its binary without the execute bit; the api runs
  # as `node` and cannot repair a root-owned file at runtime.
  && chmod -R a+rX node_modules/@ffprobe-installer node_modules/@ffmpeg-installer
ENV PORT=3333
EXPOSE 3333
USER node
CMD ["node", "main.js"]

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
# envsubst only touches LEARNWREN_* names, leaving nginx's own $host/$uri alone.
ENV NGINX_ENVSUBST_FILTER=^LEARNWREN_
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /src/dist/apps/web/browser /usr/share/nginx/html
EXPOSE 80
