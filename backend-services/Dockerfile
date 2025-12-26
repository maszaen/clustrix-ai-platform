# Use Node.js 18 (LTS)
FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "src/index.js"]
