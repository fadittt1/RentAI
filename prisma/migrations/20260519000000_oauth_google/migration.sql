-- Social login support: Google OAuth.
-- 1. Make password_hash nullable (OAuth-only users never set a password)
-- 2. Add google_id column with a unique index so a Google account links to exactly one user

ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_key" ON "users"("google_id");
