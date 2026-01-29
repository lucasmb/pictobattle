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

# Build the shared package (Transpiling to JS avoids type-stripping errors in node_modules)
RUN pnpm --filter @pictobattle/shared build

# Deploy the server for production
RUN pnpm --filter server --prod --legacy deploy /app/out

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy the deployed production bundle
COPY --from=builder --chown=node:node /app/out ./

# Use non-root user
USER node

EXPOSE 4000

# Run the server with type-stripping for the application code
# Shared package dependencies are now pre-built JS in node_modules
CMD ["node", "--experimental-transform-types", "src/index.ts"]
