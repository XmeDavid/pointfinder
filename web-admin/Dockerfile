# Stage 1: Build (using slim for Puppeteer/Chromium support during prerender)
FROM node:22-slim AS build
WORKDIR /app

# Install Chromium for Puppeteer prerendering
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Copy dependency files first for caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Minimal image that copies built files to the shared volume on start
FROM alpine:3.21
COPY --from=build /app/dist /built
CMD ["sh", "-c", "cp -r /built/* /app/dist/ && echo 'Frontend files deployed' && tail -f /dev/null"]
