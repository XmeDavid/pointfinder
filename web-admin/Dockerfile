# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app

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
