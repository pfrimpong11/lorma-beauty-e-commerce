# ==========================================================================
# Lorma Beauty POS — NestJS API
#
# Four stages so the runtime image carries production dependencies only:
#   deps      full install (dev deps needed to compile)
#   build     prisma generate + nest build
#   prod-deps a separate, production-only install
#   runtime   prod node_modules + compiled dist + prisma schema
#
# The Prisma CLI is a runtime dependency on purpose: the image runs
# `prisma migrate deploy` and the compiled seed (§38).
# ==========================================================================

# --- Stage 1: full dependencies (for building) ----------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# --- Stage 2: build -------------------------------------------------------
FROM node:22-alpine AS build
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# --- Stage 3: production dependencies only --------------------------------
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
# Omitting dev dependencies drops typescript, jest, the Nest CLI and ts-node,
# none of which run in production.
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

# --- Stage 4: runtime -----------------------------------------------------
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl libc6-compat tini
ENV NODE_ENV=production
WORKDIR /app

# Run unprivileged. node:alpine already ships a `node` user (uid 1000).
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package*.json ./

USER node
EXPOSE 4000

# Node 22 has global fetch, so no curl needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.BACKEND_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
