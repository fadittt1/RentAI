-- Two-sided reviews: one review per booking per side (renter or host).
-- Per-listing cancellation policy: hosts pick how flexible their refund rules are.
-- Host KYC: ID upload + admin review pipeline.

-- ─── Two-sided reviews ──────────────────────────────────────────────────────

CREATE TYPE "ReviewAuthorRole" AS ENUM ('RENTER', 'HOST');

ALTER TABLE "reviews"
  ADD COLUMN "author_role" "ReviewAuthorRole" NOT NULL DEFAULT 'RENTER';

-- Drop the old @unique(bookingId) — replaced with composite.
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_bookingId_key";
DROP INDEX IF EXISTS "reviews_bookingId_key";

CREATE UNIQUE INDEX "reviews_bookingId_authorRole_key"
  ON "reviews" ("bookingId", "author_role");

CREATE INDEX IF NOT EXISTS "reviews_listingId_idx" ON "reviews" ("listingId");

-- ─── Per-listing cancellation policy ────────────────────────────────────────

CREATE TYPE "CancellationPolicy" AS ENUM ('FLEXIBLE', 'MODERATE', 'STRICT');

ALTER TABLE "listings"
  ADD COLUMN "cancellation_policy" "CancellationPolicy" NOT NULL DEFAULT 'MODERATE';

-- ─── Host KYC ──────────────────────────────────────────────────────────────

ALTER TABLE "users"
  ADD COLUMN "id_document_url"     VARCHAR(500),
  ADD COLUMN "id_submitted_at"     TIMESTAMP(3),
  ADD COLUMN "id_verified_at"      TIMESTAMP(3),
  ADD COLUMN "id_verified_by"      TEXT,
  ADD COLUMN "id_rejected_at"      TIMESTAMP(3),
  ADD COLUMN "id_rejection_reason" VARCHAR(500);

-- Index so the admin review queue ("ID submitted, not yet reviewed") is fast.
CREATE INDEX "users_idSubmittedAt_idVerifiedAt_idx"
  ON "users" ("id_submitted_at", "id_verified_at")
  WHERE "id_submitted_at" IS NOT NULL AND "id_verified_at" IS NULL;
