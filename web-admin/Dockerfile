FROM node:22-alpine

WORKDIR /app

# Copy dependency files first for caching
COPY package.json package-lock.json ./

RUN npm ci

# Copy source code
COPY . .

EXPOSE 5173

CMD ["npx", "vite", "--host"]
