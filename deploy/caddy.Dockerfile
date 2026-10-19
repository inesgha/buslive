# Image du serveur web : Caddy (HTTPS automatique) + l'admin construit.
# À construire depuis la RACINE du dépôt (fait par docker compose).

# --- Construction de l'admin (fichiers statiques) ---------------------------------
FROM node:22.19-bookworm-slim AS admin
ENV HUSKY=0 CI=true
# Magasin pnpm dans un cache de BuildKit (voir --mount plus bas) : les paquets déjà
# téléchargés sont gardés entre deux constructions ; nouvelles tentatives si le réseau coupe.
ENV npm_config_store_dir=/pnpm/store npm_config_fetch_retries=5
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/admin/package.json apps/admin/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@buslive/admin..."
COPY packages/shared packages/shared
COPY apps/admin apps/admin
# L'admin est servi sous /admin/, et appelle l'API sur le même domaine.
ENV VITE_BASE_PATH=/admin/ VITE_API_URL=/api/v1
RUN pnpm --filter @buslive/shared run build && pnpm --filter @buslive/admin run build

# --- Caddy --------------------------------------------------------------------------
FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=admin /app/apps/admin/dist /srv/admin
