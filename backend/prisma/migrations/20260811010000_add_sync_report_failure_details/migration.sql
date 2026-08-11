-- AlterTable
ALTER TABLE "sync_reports" ADD COLUMN "failureDetails" JSONB NOT NULL DEFAULT '[]';
