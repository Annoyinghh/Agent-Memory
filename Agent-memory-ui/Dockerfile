# Agent-Memory frontend image (Next.js standalone production build).
# Based on the official Next.js standalone Docker pattern. next.config.mjs must set
# `output: 'standalone'` so `next build` emits `.next/standalone/server.js`.
#
# Build context = this directory (Agent-memory-ui).

# --- deps: install node_modules (no lockfile committed → npm install) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

# --- builder: compile the standalone server bundle ---
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: minimal runtime image ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Next.js standalone runs as a non-root user.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone/server.js + the traced node_modules subset, plus static assets.
# Next.js standalone does NOT copy public/ or .next/static automatically — both must
# be copied manually or assets (e.g. public/female_head_final.glb loaded by
# DigitalAvatar's GLTFLoader) 404 at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
