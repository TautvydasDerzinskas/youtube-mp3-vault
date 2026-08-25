-- Per-user Tidal access/refresh token pair (device-code OAuth2 flow, not a
-- password), opt-in HQ fallback source — see services/tidal.ts/
-- tidalReplace.ts and routes/auth.ts's /tidal/start+poll+disconnect endpoints.
ALTER TABLE "users" ADD COLUMN "tidalAccessToken" TEXT;
ALTER TABLE "users" ADD COLUMN "tidalRefreshToken" TEXT;
ALTER TABLE "users" ADD COLUMN "tidalUserId" TEXT;
ALTER TABLE "users" ADD COLUMN "tidalCountryCode" TEXT;
ALTER TABLE "users" ADD COLUMN "tidalCredentialsValid" BOOLEAN;
ALTER TABLE "users" ADD COLUMN "tidalCredentialsCheckedAt" TIMESTAMP(3);
