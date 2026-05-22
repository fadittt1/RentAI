-- Quality score (0..100) on listings and users
-- Computed by QualityScoreService; surfaced in search ranking and host badges.

ALTER TABLE "users"
  ADD COLUMN "quality_score"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quality_updated_at"  TIMESTAMP(3);

ALTER TABLE "listings"
  ADD COLUMN "quality_score"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quality_updated_at"  TIMESTAMP(3);

CREATE INDEX "users_qualityScore_idx"    ON "users"    ("quality_score" DESC);
CREATE INDEX "listings_qualityScore_idx" ON "listings" ("quality_score" DESC);

-- Wishlist: renters save listings they're interested in.

CREATE TABLE "wishlist_items" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wishlist_items_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "wishlist_items_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "wishlist_items_userId_listingId_key" ON "wishlist_items" ("user_id", "listing_id");
CREATE INDEX "wishlist_items_userId_idx" ON "wishlist_items" ("user_id");
CREATE INDEX "wishlist_items_listingId_idx" ON "wishlist_items" ("listing_id");
