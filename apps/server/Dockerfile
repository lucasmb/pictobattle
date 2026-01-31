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

# Build the shared package
RUN pnpm --filter @pictobattle/shared build

# Bundle the server using Vite (defined in server/package.json build script)
RUN pnpm --filter server build

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy only the bundled file from builder
COPY --from=builder /app/apps/server/dist/index.js ./index.js

# Use non-root user
USER node

EXPOSE 4000

# Run the bundled server
CMD ["node", "index.js"]
