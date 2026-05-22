-- Email/phone verification codes (6-digit OTPs)
-- Codes are stored as bcrypt hashes; raw values are only sent through NotificationService.

CREATE TYPE "VerificationChannel" AS ENUM ('EMAIL', 'PHONE');

CREATE TABLE "verification_codes" (
  "id"          TEXT NOT NULL,
  "user_id"     TEXT NOT NULL,
  "channel"     "VerificationChannel" NOT NULL,
  "destination" VARCHAR(255) NOT NULL,
  "code_hash"   VARCHAR(255) NOT NULL,
  "expires_at"  TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "verification_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "verification_codes_user_id_channel_idx" ON "verification_codes" ("user_id", "channel");
CREATE INDEX "verification_codes_expires_at_idx" ON "verification_codes" ("expires_at");
