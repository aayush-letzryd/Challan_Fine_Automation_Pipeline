FROM node:20-bookworm-slim

# Install system dependencies for Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Install Playwright Chromium along with all Linux system libraries
RUN npx playwright install --with-deps chromium

# Copy source code and assets
COPY . .

# Environment Defaults
ENV NODE_ENV=production
ENV HEADLESS=true

# Execution command
CMD ["node", "main.js"]
