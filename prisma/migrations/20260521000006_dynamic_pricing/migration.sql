-- Smart Pricing: per-listing opt-in, a base-price snapshot, and an audit log
-- of every adjustment so hosts can see "why my price changed".

ALTER TABLE "listings"
  ADD COLUMN "dynamic_pricing"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "base_price_per_day"  DECIMAL(10,2),
  ADD COLUMN "dynamic_pricing_at"  TIMESTAMP(3);

CREATE TABLE "price_adjustment_logs" (
  "id"          TEXT NOT NULL,
  "listing_id"  TEXT NOT NULL,
  "old_price"   DECIMAL(10,2) NOT NULL,
  "new_price"   DECIMAL(10,2) NOT NULL,
  "base_price"  DECIMAL(10,2) NOT NULL,
  "multiplier"  DECIMAL(5,4)  NOT NULL,
  "factors"     JSONB NOT NULL,
  "reason"      TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "price_adjustment_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "price_adjustment_logs_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "price_adjustment_logs_listingId_createdAt_idx"
  ON "price_adjustment_logs" ("listing_id", "created_at" DESC);
