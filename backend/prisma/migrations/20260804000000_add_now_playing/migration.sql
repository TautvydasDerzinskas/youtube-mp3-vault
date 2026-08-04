-- AlterTable
ALTER TABLE "users" ADD COLUMN "nowPlayingPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "nowPlayingArtist" TEXT,
ADD COLUMN "nowPlayingTitle" TEXT,
ADD COLUMN "nowPlayingHeartbeatAt" TIMESTAMP(3);
