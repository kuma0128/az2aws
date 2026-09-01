# =============================================================================
# Stage 1: Install production dependencies
# =============================================================================
FROM node:24-slim AS deps

WORKDIR /az2aws

COPY package.json pnpm-lock.yaml ./

RUN corepack enable \
    && pnpm install --prod --frozen-lockfile

# =============================================================================
# Stage 2: Production runtime image
# =============================================================================
FROM node:24-slim

WORKDIR /az2aws

ENV NODE_ENV=production

# az2aws drives an installed Chromium-based browser and no longer bundles one,
# so the image ships Debian's Chromium (which pulls in its own runtime libs).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV BROWSER_CHROME_BIN=/usr/bin/chromium

# Copy production artifacts from build stage
COPY --from=deps /az2aws/node_modules ./node_modules
COPY --from=deps /az2aws/package.json ./package.json
COPY lib ./lib

ENTRYPOINT ["node", "/az2aws/lib", "--no-sandbox"]
