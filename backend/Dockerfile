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
# ffmpeg    — required by yt-dlp for audio conversion, and by audioTranscode.ts
#             for normalizing Soulseek/JioSaavn HQ downloads to mp3
# python3   — required by yt-dlp
#
# bgutil-ytdlp-pot-provider is the yt-dlp-side half of the PO-token setup —
# a plugin that talks to the bgutil-provider sidecar container (see
# docker-compose.yml) over HTTP to fetch proof-of-origin tokens, which
# YouTube increasingly requires to avoid treating this server's traffic as a
# bot. Installed unconditionally (cheap, does nothing unless
# BGUTIL_PROVIDER_URL is actually set — see config.ts) rather than gated
# behind a build arg, so it's simply there for anyone who later points the
# env var at a running sidecar without needing to rebuild the image.
RUN apk add --no-cache openssl ffmpeg python3 py3-pip && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir yt-dlp bgutil-ytdlp-pot-provider && \
    ln -s /opt/venv/bin/yt-dlp /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
