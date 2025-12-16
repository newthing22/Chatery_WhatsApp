# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production stage
FROM node:20-alpine

# Add labels
LABEL maintainer="Farin Azis Chan <farinazischan@gmail.com>"
LABEL description="Chatery WhatsApp API - Multi-session WhatsApp API with Baileys"
LABEL version="1.0.0"

# Create non-root user for security
RUN addgroup -g 1001 -S chatery && \
    adduser -S -D -H -u 1001 -G chatery chatery

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY . .

# Create directories for sessions and media with proper permissions
RUN mkdir -p /app/sessions /app/public/media /app/store && \
    chown -R chatery:chatery /app

# Switch to non-root user
USER chatery

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the application
CMD ["node", "index.js"]
