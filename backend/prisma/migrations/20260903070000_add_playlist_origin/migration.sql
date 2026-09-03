-- AlterTable
ALTER TABLE "playlists" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'imported';

-- Backfill: existing generated playlists (youtubeId IS NULL) predate this
-- column and would otherwise default to 'imported', which is wrong.
UPDATE "playlists" SET "origin" = 'generated' WHERE "youtubeId" IS NULL;
