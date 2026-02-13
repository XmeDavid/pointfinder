# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app

# Copy dependency files first for caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY . .
ARG VITE_API_URL=/api
ARG VITE_WS_URL=/ws
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# Stage 2: Minimal image that copies built files to the shared volume on start
FROM alpine:3.21
COPY --from=build /app/dist /built
CMD ["sh", "-c", "cp -r /built/* /app/dist/ && echo 'Frontend files deployed' && tail -f /dev/null"]
