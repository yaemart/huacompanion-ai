# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
ARG NEXT_PUBLIC_FORM_MODE=trial
ENV NEXT_PUBLIC_FORM_MODE=${NEXT_PUBLIC_FORM_MODE} \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_ENV=build \
    DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/build_only \
    PAYLOAD_SECRET=build-only-placeholder-never-use-at-runtime
RUN npm run build

FROM node:24.22.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build --chown=node:node /app/.next ./.next
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node payload-types.ts next.config.mjs tsconfig.json ./
RUN mkdir -p .local/content-media && chown -R node:node .local
USER node
EXPOSE 3000
CMD ["npm", "run", "start:host"]
