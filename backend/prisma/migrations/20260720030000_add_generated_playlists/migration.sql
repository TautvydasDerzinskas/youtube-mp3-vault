-- Generated ("similar/alternative") playlists have no real YouTube playlist
-- behind them, so youtubeId can no longer be required.
ALTER TABLE "playlists" ALTER COLUMN "youtubeId" DROP NOT NULL;

ALTER TABLE "playlists"
  ADD COLUMN "sourcePlaylistId" TEXT,
  ADD COLUMN "sourcePlaylistName" TEXT;

-- One generated playlist per source, enforced at the DB level (multiple
-- NULLs — i.e. every normal, non-generated playlist — don't collide).
CREATE UNIQUE INDEX "playlists_sourcePlaylistId_key" ON "playlists"("sourcePlaylistId");

ALTER TABLE "playlists"
  ADD CONSTRAINT "playlists_sourcePlaylistId_fkey"
  FOREIGN KEY ("sourcePlaylistId") REFERENCES "playlists"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
