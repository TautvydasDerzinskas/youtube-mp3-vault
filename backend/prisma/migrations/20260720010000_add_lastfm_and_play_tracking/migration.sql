-- Last.fm account link per user (see routes/auth.ts's /lastfm/connect +
-- /lastfm/callback) and internal per-track listening stats (see the new
-- POST .../played route in routes/youtube.ts).
ALTER TABLE "users"
  ADD COLUMN "lastfmSessionKey" TEXT,
  ADD COLUMN "lastfmUsername" TEXT,
  ADD COLUMN "scrobblingEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "playlist_videos"
  ADD COLUMN "playCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastPlayedAt" TIMESTAMP(3);

-- App-wide Last.fm credentials, admin-editable alongside SMTP/Postgres —
-- see services/settings.ts.
ALTER TABLE "app_settings"
  ADD COLUMN "lastfmApiKey" TEXT,
  ADD COLUMN "lastfmApiSecret" TEXT;
