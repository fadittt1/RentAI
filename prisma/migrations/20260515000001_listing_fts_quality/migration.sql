-- Three search-engine improvements:
-- 1. Full-text search: tsv tsvector column with GIN index + trigger
-- 2. Listing-level quality signals: rating_avg, booking_count_30d
-- 3. (Multi-amenity filtering handled in application code via separate ILIKE conditions)

-- ─── 1. Full-text search ────────────────────────────────────────────────────

ALTER TABLE listings ADD COLUMN IF NOT EXISTS tsv tsvector;

-- Backfill all existing rows (French + simple English dictionary)
UPDATE listings
SET tsv = to_tsvector('french', coalesce(title, '') || ' ' || coalesce(description, ''));

-- Trigger to keep tsv in sync on insert/update
CREATE OR REPLACE FUNCTION listings_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('french', coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS listings_tsv_trigger ON listings;
CREATE TRIGGER listings_tsv_trigger
  BEFORE INSERT OR UPDATE OF title, description ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_tsv_update();

-- GIN index for fast FTS lookup
CREATE INDEX IF NOT EXISTS listings_tsv_gin ON listings USING GIN (tsv);

-- ─── 2. Listing-level quality columns ───────────────────────────────────────

ALTER TABLE listings ADD COLUMN IF NOT EXISTS rating_avg float NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS booking_count_30d int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS listings_rating_avg_idx ON listings (rating_avg DESC);
