-- Renter trust score (0..100). Mirrors the host quality score with renter-side
-- signals. Higher score = "Trusted renter" badge to hosts + future
-- instant-book eligibility + lower deposit requirements.

ALTER TABLE "users"
  ADD COLUMN "renter_trust_score"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "renter_trust_updated_at" TIMESTAMP(3);

CREATE INDEX "users_renterTrustScore_idx"
  ON "users" ("renter_trust_score" DESC);
