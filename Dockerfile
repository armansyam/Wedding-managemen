# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app/backend

# Install dependencies first (cached layer)
COPY backend/package*.json ./
RUN npm install --production

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app/backend

# Copy node_modules from builder
COPY --from=builder /app/backend/node_modules ./node_modules

# Copy app source
COPY backend/ ./

# Create uploads directory
RUN mkdir -p uploads/receipts

EXPOSE 3000

CMD ["node", "server.js"]
