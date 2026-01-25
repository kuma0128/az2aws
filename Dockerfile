FROM node:24-slim AS build
WORKDIR /az2aws
COPY package.json yarn.lock ./
RUN yarn install --production

FROM node:24-slim
WORKDIR /az2aws
ENV NODE_ENV=production

# Install Puppeteer dependencies: https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md#chrome-headless-doesnt-launch
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

COPY --from=build /az2aws/node_modules /az2aws/node_modules
COPY --from=build /az2aws/package.json /az2aws/package.json
COPY lib /az2aws/lib

ENTRYPOINT ["node", "/az2aws/lib", "--no-sandbox"]
