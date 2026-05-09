FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Needed at build time so auth.ts module-level check doesn't throw
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL
ENV AUTH_SECRET=build-placeholder
ENV AUTH_URL=http://localhost:3000

RUN npm run build

# ---- runtime image ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# standalone output bundles only what's needed
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
