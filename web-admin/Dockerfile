# Build context is the REPOSITORY ROOT (web-admin depends on workspace packages):
#   docker build -f web-admin/Dockerfile .
# Stage 1: install the Bun workspace and build the Vite app
FROM oven/bun:1-alpine AS build
WORKDIR /repo

# Workspace manifests first so dependency installs cache well
COPY package.json bun.lock ./
COPY web-admin/package.json web-admin/
COPY components/core/package.json components/core/
COPY packages/api/package.json packages/api/
COPY packages/game-core/package.json packages/game-core/
COPY packages/i18n/package.json packages/i18n/
COPY packages/tauri-plugin-pointfinder-nfc/package.json packages/tauri-plugin-pointfinder-nfc/
COPY packages/tauri-plugin-pointfinder-push/package.json packages/tauri-plugin-pointfinder-push/
COPY packages/tauri-plugin-pointfinder-secure-store/package.json packages/tauri-plugin-pointfinder-secure-store/
COPY mobile/package.json mobile/
RUN bun install --frozen-lockfile

COPY components ./components
COPY packages ./packages
COPY web-admin ./web-admin
ARG VITE_API_URL=/api
ARG VITE_WS_URL=/ws-native
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN cd web-admin && bun run build

# Stage 2: serve the built app
FROM nginx:1.27-alpine
COPY web-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/web-admin/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
