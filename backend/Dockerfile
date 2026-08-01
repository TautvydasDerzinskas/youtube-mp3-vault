FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src ./src/

RUN npx prisma generate && npm run build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# openssl   — required by Prisma engine binaries (libssl.so.3)
# ffmpeg    — required by yt-dlp for audio conversion
# python3   — required by yt-dlp
# chromium + nss/freetype/harfbuzz/ca-certificates/ttf-freefont — headless
#   browser for the Qobuz HQ fallback's one-time community verification (see
#   services/qobuz/session.ts). Alpine's own chromium package, not
#   Playwright's bundled download — Playwright's own Chromium binaries are
#   built against glibc and won't run on this musl-based image.
RUN apk add --no-cache openssl ffmpeg python3 py3-pip \
    chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir yt-dlp && \
    ln -s /opt/venv/bin/yt-dlp /usr/local/bin/yt-dlp

ENV QOBUZ_CHROMIUM_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
