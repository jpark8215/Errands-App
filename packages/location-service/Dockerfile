# Multi-stage build for location service
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 locationservice

# Copy built application
COPY --from=builder --chown=locationservice:nodejs /app/dist ./dist
COPY --from=builder --chown=locationservice:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=locationservice:nodejs /app/package.json ./package.json

# Create logs directory
RUN mkdir -p /app/logs && chown locationservice:nodejs /app/logs

# Switch to non-root user
USER locationservice

# Expose port
EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3007/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/index.js"]
