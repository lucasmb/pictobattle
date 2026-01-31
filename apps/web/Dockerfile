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

# Build shared package first (required by web app)
RUN pnpm --filter @pictobattle/shared build

# Build with environment variables
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN pnpm --filter web build

# Production stage
FROM alpine:latest AS runner

# Install necessary tools
RUN apk add --no-cache coreutils

WORKDIR /app

# Copy built files to a neutral location
COPY --from=builder /app/apps/web/dist ./dist
COPY apps/web/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# The volume will be mounted at /usr/share/caddy
# entrypoint.sh will copy files from ./dist to /usr/share/caddy
ENTRYPOINT ["./entrypoint.sh"]
