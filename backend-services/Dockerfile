# Use Node.js 18 (LTS)
FROM node:18-slim

WORKDIR /app

# Copy package files first
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Copy public assets (admin panel HTML)
COPY public/ ./public/

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "src/index.js"]
