-- AlterTable
ALTER TABLE "playlist_videos" ADD COLUMN     "audioAnalysisFetchedAt" TIMESTAMP(3),
ADD COLUMN     "audioAnalysisStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "audioEmbedding" BYTEA;

-- CreateIndex
CREATE INDEX "playlist_videos_audioAnalysisStatus_addedAt_idx" ON "playlist_videos"("audioAnalysisStatus", "addedAt");
