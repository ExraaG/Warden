# Multi-stage Dockerfile for Warden (Express + Next.js)
FROM node:20-alpine AS base

# Stage 1: Build shared library and server application
FROM base AS builder
WORKDIR /app

# Copy shared package and source
COPY shared ./shared
RUN cd shared && npm install && npm run build

# Copy server package
COPY server ./server
WORKDIR /app/server
RUN npm install
RUN npm run build

# Stage 2: Production Runner
FROM base AS runner
WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=22313
ENV TZ=UTC
ENV DATA_DIR=/data

# Install curl for healthcheck & OpenJDK runtimes for Minecraft servers
# Java 17 for MC 1.16.5–1.20.4, Java 21 for MC 1.20.5+, Java 25+/26 for MC 26.x snapshots
# Dynamic resolver in serverManager.ts scans /usr/lib/jvm/ to find the best match
RUN apk add --no-cache curl openjdk17-jre \
    && (apk add --no-cache openjdk21-jre || true) \
    && (apk add --no-cache openjdk26-jre || apk add --no-cache openjdk25-jre || true) \
    && ln -sf /usr/lib/jvm/java-21-openjdk/bin/java /usr/local/bin/java 2>/dev/null || true

# Copy compiled shared library and server output
COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/server/package.json ./package.json
COPY --from=builder /app/server/version.json ./version.json
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/dist-server ./dist-server
COPY --from=builder /app/server/.next ./.next
COPY --from=builder /app/server/public ./public

# Ensure persistent data directory exists
RUN mkdir -p /data

# Expose Warden Web UI (22313) and Minecraft Game Port (25565)
EXPOSE 22313 25565

# Docker Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

CMD ["node", "dist-server/server.js"]
