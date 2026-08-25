-- Per-user Qobuz email/password, opt-in HQ fallback source — see
-- services/qobuz.ts/qobuzReplace.ts and routes/auth.ts's /qobuz endpoints.
ALTER TABLE "users" ADD COLUMN "qobuzEmail" TEXT;
ALTER TABLE "users" ADD COLUMN "qobuzPassword" TEXT;
ALTER TABLE "users" ADD COLUMN "qobuzCredentialsValid" BOOLEAN;
ALTER TABLE "users" ADD COLUMN "qobuzCredentialsCheckedAt" TIMESTAMP(3);
