# Build stage: shared + server + web. DHI "-dev" variant has sh, npm and corepack; the runtime one has none
FROM dhi.io/node:26-alpine-dev AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/typescript-config/package.json ./packages/typescript-config/

RUN pnpm install --frozen-lockfile

COPY . .

# Public GA4 measurement ID baked into the web build; empty disables analytics
ARG VITE_GA_ID="G-5BPLNEEG6M"
RUN pnpm --filter @pictobattle/shared build \
    && pnpm --filter server build \
    && pnpm --filter web build

# socket.io and ws can't be bundled (complex internal deps); installed here since the runtime image has no npm
FROM dhi.io/node:26-alpine-dev AS runtime-deps
WORKDIR /app
RUN npm install socket.io@4.8.4 ws@8.21.3 --omit=dev --no-package-lock

# Runtime: one Node process serves the API, websockets and the static web build
FROM dhi.io/node:26-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=runtime-deps /app/node_modules ./node_modules

COPY --from=builder /app/apps/server/dist/index.js ./index.mjs
COPY --from=builder /app/apps/web/dist ./public

USER node
EXPOSE 4000

CMD ["node", "index.mjs"]
