# Build stage
FROM node:24-alpine AS builder

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config and package files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build with environment variables
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN pnpm --filter web build

# Production stage
FROM alpine:latest AS runner

# Create directory for static files
WORKDIR /usr/share/caddy

# Copy built files from builder
COPY --from=builder /app/apps/web/dist .

# The container just stays alive to provide the volume contents
# Since it's mounted in docker-compose, this will populate the shared volume
CMD ["sleep", "infinity"]
