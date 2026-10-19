# Image de l'API BusLive. À construire depuis la RACINE du dépôt :
#   docker build -f deploy/api.Dockerfile -t buslive-api .
# (fait automatiquement par docker compose, voir docker-compose.prod.yml)

# --- Base commune ---------------------------------------------------------------
# Même version de Node qu'en développement (engines : >= 22.18).
FROM node:22.19-bookworm-slim AS base
# OpenSSL : nécessaire au moteur de migrations de Prisma (absent de l'image « slim »).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- Construction --------------------------------------------------------------
FROM base AS build
# HUSKY=0 : pas de hooks git dans l'image ; CI=true : installation non interactive.
ENV HUSKY=0 CI=true
# Magasin pnpm dans un cache de BuildKit (voir --mount plus bas) : les paquets déjà
# téléchargés sont gardés entre deux constructions ; nouvelles tentatives si le réseau coupe.
ENV npm_config_store_dir=/pnpm/store npm_config_fetch_retries=5
RUN corepack enable
WORKDIR /app

# Dépendances d'abord (cette étape reste en cache tant que le lockfile ne change pas).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
# Seulement l'API et ce dont elle dépend (pas le mobile ni l'admin).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@buslive/api..."

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @buslive/shared run build && pnpm --filter @buslive/api run build

# --- Exécution -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# On garde node_modules complet : la CLI Prisma (dépendance de dev) applique les
# migrations au déploiement (service « migrate »).
# Fichiers laissés à root : l'utilisateur « node » peut les lire, pas les modifier
# (rien n'est écrit sur le disque à l'exécution, les journaux vont sur la sortie standard).
COPY --from=build /app /app
# Jamais en root : l'utilisateur « node » de l'image officielle.
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "apps/api/dist/main.js"]
