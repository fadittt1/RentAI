-- Refresh-token whitelist. Each issued refresh token is stored as a sha256
-- hash; raw tokens never sit at rest in the database. Logout flips `revoked_at`
-- so the token can no longer be exchanged for a new access token.

CREATE TABLE "refresh_tokens" (
  "id"          TEXT NOT NULL,
  "user_id"     TEXT NOT NULL,
  "token_hash"  VARCHAR(255) NOT NULL,
  "expires_at"  TIMESTAMP(3) NOT NULL,
  "revoked_at"  TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address"  VARCHAR(64),
  "user_agent"  VARCHAR(255),

  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens" ("token_hash");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" ("expires_at");
