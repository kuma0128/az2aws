# =============================================================================
# Stage 1: Install production dependencies
# =============================================================================
FROM node:24-slim AS deps

WORKDIR /az2aws

ARG COREPACK_VERSION=0.34.7

# Place Puppeteer's Chrome under the workdir for easy COPY to final stage
ENV PUPPETEER_CACHE_DIR=/az2aws/.cache/puppeteer
# Skip chrome-headless-shell download (this project uses full Chrome only)
ENV PUPPETEER_CHROME_HEADLESS_SHELL_SKIP_DOWNLOAD=true

COPY package.json pnpm-lock.yaml ./
COPY scripts ./scripts

RUN npm install --global corepack@${COREPACK_VERSION} \
    && corepack enable pnpm \
    && node ./scripts/check-pnpm-lockfile.cjs \
    && corepack pnpm install --prod --frozen-lockfile

# =============================================================================
# Stage 2: Production runtime image
# =============================================================================
FROM node:24-slim

WORKDIR /az2aws

ENV NODE_ENV=production
ENV PUPPETEER_CACHE_DIR=/az2aws/.cache/puppeteer

# Install Chromium shared library dependencies
# Ref: https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy production artifacts from build stage
COPY --from=deps /az2aws/node_modules ./node_modules
COPY --from=deps /az2aws/.cache/puppeteer ./.cache/puppeteer
COPY --from=deps /az2aws/package.json ./package.json
COPY lib ./lib

ENTRYPOINT ["node", "/az2aws/lib", "--no-sandbox"]
