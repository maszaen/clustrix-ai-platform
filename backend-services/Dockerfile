# Use Node.js 18 (LTS)
FROM node:18-slim

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies (use npm install if lock file might be outdated)
RUN npm install --only=production

# Copy source code
COPY src/ ./src/

# Copy public assets (admin panel HTML)
COPY public/ ./public/

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "src/index.js"]
