-- Per-user Deezer "arl" cookie, opt-in HQ fallback source — see
-- services/deezer.ts/deezerReplace.ts and routes/auth.ts's /deezer endpoints.
ALTER TABLE "users" ADD COLUMN "deezerArlCookie" TEXT;
ALTER TABLE "users" ADD COLUMN "deezerCookieValid" BOOLEAN;
ALTER TABLE "users" ADD COLUMN "deezerCookieCheckedAt" TIMESTAMP(3);
