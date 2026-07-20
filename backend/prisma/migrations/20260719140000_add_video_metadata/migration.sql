-- AlterTable
ALTER TABLE "playlist_videos" ADD COLUMN     "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "artist" TEXT,
ADD COLUMN     "album" TEXT,
ADD COLUMN     "trackNumber" INTEGER,
ADD COLUMN     "genre" TEXT,
ADD COLUMN     "mbRecordingId" TEXT,
ADD COLUMN     "metadataStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "metadataFetchedAt" TIMESTAMP(3);

UPDATE "playlist_videos" SET "addedAt" = "createdAt";

-- CreateIndex
CREATE INDEX "playlist_videos_playlistId_artist_idx" ON "playlist_videos"("playlistId", "artist");

-- CreateIndex
CREATE INDEX "playlist_videos_playlistId_genre_idx" ON "playlist_videos"("playlistId", "genre");
