-- Singleton settings row (id is always 1) holding SMTP + Postgres connection
-- values that used to be env-var-only — see services/settings.ts, which
-- seeds this row from the current environment the first time it's read, and
-- the admin Settings page, which edits it from then on.
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpFrom" TEXT NOT NULL DEFAULT 'YoutubeVault <no-reply@localhost>',
    "postgresDb" TEXT NOT NULL,
    "postgresUser" TEXT NOT NULL,
    "postgresPassword" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);
