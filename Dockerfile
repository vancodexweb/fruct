# syntax=docker/dockerfile:1

# ---- build: compile TypeScript, generate the Prisma client ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# python3/make/g++ — bcrypt needs to compile its native binding.
# openssl — required by the Prisma query engine (both to generate and to run).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runtime-deps: production-only node_modules, with the Prisma client
# ---- generated fresh here too (its query engine binary must match this
# ---- stage's platform, not necessarily the build stage's) ----
FROM node:22-bookworm-slim AS runtime-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# ---- runtime: the actual image that ships ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash appuser

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
RUN chown -R appuser:appuser /app

USER appuser
EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Migrate → seed (idempotent — no-ops once the tenant exists) → serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
