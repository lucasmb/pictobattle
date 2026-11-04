# Build stage: shared + server + web
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/typescript-config/package.json ./packages/typescript-config/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @pictobattle/shared build \
 && pnpm --filter server build \
 && pnpm --filter web build

# Runtime: one Node process serves the API, websockets and the static web build
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# socket.io and ws can't be bundled (complex internal deps)
RUN npm install socket.io@4.8.4 ws@8.21.3 --omit=dev --no-package-lock

COPY --from=builder /app/apps/server/dist/index.js ./index.mjs
COPY --from=builder /app/apps/web/dist ./public

USER node
EXPOSE 4000

CMD ["node", "index.mjs"]
