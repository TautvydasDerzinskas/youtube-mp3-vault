-- Admin allow-list for per-user, opt-in HQ providers (currently just
-- Deezer) — see services/settings.ts and services/deezer.ts.
ALTER TABLE "app_settings" ADD COLUMN "hqAllowedUserProviders" TEXT[] NOT NULL DEFAULT ARRAY['deezer']::TEXT[];
