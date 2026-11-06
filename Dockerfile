# Stage 1: Build Frontend SPA Bundle
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Hardened Production Runtime (Non-Root User)
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# WAJIB saat `docker run`: BMI_SESSION_SECRET minimal 32 karakter acak.
# server.ts sengaja fail-fast (crash) di mode produksi bila secret kosong/lemah:
#   docker run -e BMI_SESSION_SECRET="$(openssl rand -hex 32)" -p 3000:3000 bmi-workshop
ENV BMI_SESSION_SECRET=""

RUN addgroup -S bmi && adduser -S bmiuser -G bmi

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src

# server.ts menulis state ke <__dirname>/.data (workshop-db.json, backups/, dsb).
# Direktori harus dibuat dan dimiliki user non-root, jika tidak startup gagal EACCES.
RUN mkdir -p /app/.data /app/.data/backups && chown -R bmiuser:bmi /app/.data

USER bmiuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["npx", "tsx", "server.ts"]
