# syntax=docker/dockerfile:1
# Self-hosting images for Learn Wren (US-09-04). Three targets, one build
# context; docker-compose.yml picks the target per service.
#
#   builder   — installs the workspace and builds web + api once
#   api       — NestJS api in listen mode (node dist/apps/api/main.js)
#   web       — nginx serving the Angular build, proxying /api to the api
#   emulators — Firebase Emulator Suite (Auth, Firestore, Storage, UI)

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
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
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

# ---------------------------------------------------------------------------
# The Firestore emulator is a JVM; firebase-tools needs Java 21+. Start from a
# JRE image and copy the node binary in rather than apt-installing a JDK.
FROM eclipse-temurin:21-jre-noble AS emulators
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && npm install -g --no-audit --no-fund firebase-tools@15.16.0 \
  && npm cache clean --force \
  # Pre-download the emulator jars so first `compose up` works offline.
  && firebase setup:emulators:firestore \
  && firebase setup:emulators:storage \
  && firebase setup:emulators:ui
WORKDIR /app
COPY docker/firebase.json ./firebase.json
COPY firestore.rules firestore.indexes.json storage.rules ./
COPY docker/emulators-entrypoint.sh /usr/local/bin/emulators-entrypoint
RUN chmod +x /usr/local/bin/emulators-entrypoint
VOLUME /data
EXPOSE 4000 8080 9099 9199
ENTRYPOINT ["emulators-entrypoint"]
