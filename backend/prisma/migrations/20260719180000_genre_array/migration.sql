-- Convert the single-value genre column into an array — a broad genre like
-- "Electronic" covers wildly different-sounding music, so a track can now
-- carry more than one parent genre plus a specific style tag (see
-- audio-analysis/app.py). Existing single values become one-element arrays;
-- NULL (not yet analyzed) becomes an empty array, not NULL.
ALTER TABLE "playlist_videos"
  ALTER COLUMN "genre" TYPE TEXT[] USING (CASE WHEN "genre" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["genre"] END),
  ALTER COLUMN "genre" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "genre" SET NOT NULL;

ALTER TABLE "playlist_videos" RENAME COLUMN "genre" TO "genres";

-- Never used by any backend query (genre filtering has only ever happened
-- client-side against an already-fetched video list) and there's no plain
-- btree equivalent for an array column anyway.
DROP INDEX IF EXISTS "playlist_videos_playlistId_genre_idx";
