-- Retroactive fix for rows written before hqReplace.ts/jiosaavnReplace.ts/
-- bandcampReplace.ts started gating hqFileDownloaded on actually reaching
-- the true 320kbps ceiling (MAX_PLAUSIBLE_MP3_BITRATE_KBPS): earlier code
-- always set hqFileDownloaded = true on any successful download regardless
-- of the file's real bitrate (e.g. a Bandcamp 128kbps preview-stream match,
-- or a JioSaavn 96/160kbps match that only cleared a tier's improvement
-- margin), which permanently excluded those rows from every future rescan
-- (see slskdQualityWorker.ts's rescanAll query: `hqFileDownloaded: false`).
-- Unmarking them here doesn't touch the already-downloaded file or its
-- recorded bitrate, just the flags — the next admin-triggered "Scan for HQ"
-- pass will re-search for a genuinely better source.
UPDATE "playlist_videos"
SET "hqFileDownloaded" = false,
    "betterQualityExists" = true
WHERE "hqFileDownloaded" = true
  AND "bitrate" IS NOT NULL
  AND "bitrate" < 320;
