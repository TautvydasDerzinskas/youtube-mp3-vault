-- CreateIndex
-- Backs the metadata worker's global "next pending video across all playlists"
-- query (backend/src/services/metadataWorker.ts) — without it that query is a
-- full table scan of playlist_videos once a library grows into the tens of
-- thousands of rows, run roughly once a second for the lifetime of the process.
CREATE INDEX "playlist_videos_metadataStatus_addedAt_idx" ON "playlist_videos"("metadataStatus", "addedAt");
