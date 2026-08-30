-- AlterTable
ALTER TABLE "users" ADD COLUMN "playbackPlaylistId" TEXT,
ADD COLUMN "playbackVideoId" TEXT,
ADD COLUMN "playbackPositionSeconds" DOUBLE PRECISION,
ADD COLUMN "playbackIsShuffle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "playbackIsRepeat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "playbackOriginPath" TEXT,
ADD COLUMN "playbackQueue" JSONB,
ADD COLUMN "playbackHistory" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "playbackUpdatedAt" TIMESTAMP(3);
