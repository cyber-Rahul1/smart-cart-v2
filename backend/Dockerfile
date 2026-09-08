# Build stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install dependencies including dev dependencies
RUN npm ci --legacy-peer-deps

COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /usr/src/app

# Set NODE_ENV
ENV NODE_ENV=production

# Copy only the package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --legacy-peer-deps

# Copy the built artifacts
COPY --from=builder /usr/src/app/dist ./dist

# Use non-root user
USER node

# Expose port (can be overridden)
EXPOSE 3000

# Default command (API). Worker can override this with npm run start:worker:prod (if defined) or node dist/worker.js
CMD ["node", "dist/main.js"]
