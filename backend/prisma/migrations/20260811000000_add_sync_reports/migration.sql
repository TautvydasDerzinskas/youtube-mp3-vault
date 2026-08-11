-- CreateTable
CREATE TABLE "sync_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "addedCount" INTEGER NOT NULL DEFAULT 0,
    "removedCount" INTEGER NOT NULL DEFAULT 0,
    "downloadedCount" INTEGER NOT NULL DEFAULT 0,
    "recoveredCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "failureReasons" JSONB NOT NULL DEFAULT '{}',
    "newHqCount" INTEGER NOT NULL DEFAULT 0,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_reports_userId_seenAt_idx" ON "sync_reports"("userId", "seenAt");

-- AddForeignKey
ALTER TABLE "sync_reports" ADD CONSTRAINT "sync_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_reports" ADD CONSTRAINT "sync_reports_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
