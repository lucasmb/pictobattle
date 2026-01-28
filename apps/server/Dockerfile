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

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy necessary files from builder with correct ownership
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/pnpm-lock.yaml ./
COPY --from=builder --chown=node:node /app/apps/server/package.json ./apps/server/
COPY --from=builder --chown=node:node /app/apps/server/src ./apps/server/src
COPY --from=builder --chown=node:node /app/packages/shared ./packages/shared
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Use non-root user
USER node

EXPOSE 3001

CMD ["node", "--experimental-transform-types", "apps/server/src/index.ts"]
