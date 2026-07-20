ALTER TABLE "playlist_videos"
  ALTER COLUMN "genre" TYPE TEXT[] USING (CASE WHEN "genre" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["genre"] END),
  ALTER COLUMN "genre" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "genre" SET NOT NULL;

ALTER TABLE "playlist_videos" RENAME COLUMN "genre" TO "genres";

DROP INDEX IF EXISTS "playlist_videos_playlistId_genre_idx";
