-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN "hqAutoDownloadEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "playlist_videos" ADD COLUMN "hqFileDownloaded" BOOLEAN NOT NULL DEFAULT false;
