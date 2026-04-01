# Build stage — compile native modules (better-sqlite3, tiktoken, sqlite3)
FROM node:22-slim AS build

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Production stage — runtime only
FROM node:22-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY . .

VOLUME ["/app/data"]

EXPOSE ${PAPERLESS_AI_PORT:-3000}

ENV NODE_ENV=production
ENV RAG_SERVICE_ENABLED=false

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PAPERLESS_AI_PORT:-3000}/health || exit 1

CMD ["node", "server.js"]
