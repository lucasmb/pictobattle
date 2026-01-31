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

# Bundle the server using Vite - single file with all deps bundled
RUN pnpm --filter server build

# Production stage - distroless for minimal size and security
FROM gcr.io/distroless/nodejs24-debian12 AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy only the bundled file from builder
COPY --from=builder /app/apps/server/dist/index.js ./index.js

EXPOSE 4000

# Run the bundled server
CMD ["index.js"]
