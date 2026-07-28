-- AlterTable
ALTER TABLE "playlist_videos" ADD COLUMN "betterQualityExists" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "playlist_videos" ADD COLUMN "qualityCheckStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "playlist_videos" ADD COLUMN "qualityCheckedAt" TIMESTAMP(3);
