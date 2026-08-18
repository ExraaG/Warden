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
ENV PORT=3000
ENV TZ=UTC
ENV DATA_DIR=/data

# Install curl for healthcheck & OpenJDK runtime for Minecraft servers
RUN apk add --no-cache curl openjdk21-jre openjdk17-jre

# Copy compiled shared library and server output
COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/server/package.json ./package.json
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/dist-server ./dist-server
COPY --from=builder /app/server/.next ./.next
COPY --from=builder /app/server/public ./public

# Ensure persistent data directory exists
RUN mkdir -p /data

# Expose Warden Web UI (3000) and Minecraft Game Port (25565)
EXPOSE 3000 25565

# Docker Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

CMD ["node", "dist-server/server.js"]
