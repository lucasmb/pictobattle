# Build stage
FROM node:24-alpine AS builder

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config and package files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the shared package
RUN pnpm --filter @pictobattle/shared build

# Bundle the server using Vite - bundles most deps, externalizes socket.io
RUN pnpm --filter server build

# Production stage - minimal node:24-alpine
FROM node:24-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy the bundled server (contains express, cors, zod, etc.)
COPY --from=builder /app/apps/server/dist/index.js ./index.js

# Install socket.io and ws (can't be bundled due to complex internal dependencies)
RUN npm install socket.io@4.8.1 ws@8.17.1 --omit=dev --no-package-lock

# Use non-root user
USER node

EXPOSE 4000

# Run the bundled server
CMD ["node", "index.js"]
