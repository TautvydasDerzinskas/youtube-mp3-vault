ALTER TABLE "playlist_videos" ADD COLUMN "originalTitle" TEXT;

-- Backfill only for videos MusicBrainz already matched ('found'): their
-- `title` column has never been rewritten by the local fallback parser, so
-- it's still exactly the raw YouTube title and safe to copy as-is.
--
-- Deliberately NOT backfilled for 'not_found' rows — their `title` was
-- already overwritten by the heuristic fallback parser before this column
-- existed, so the true original YouTube title isn't recoverable from the
-- current data for those rows. They'll simply have originalTitle = NULL.
UPDATE "playlist_videos" SET "originalTitle" = title WHERE "metadataStatus" = 'found';
