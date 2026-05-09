-- Recreate ai_price_suggestion_logs with final column names.
-- The original create + rename migrations ran against a DB that was later reset,
-- so the table was lost while the migration records remained. This migration
-- creates it idempotently with the fully-renamed schema.

CREATE TABLE IF NOT EXISTS "ai_price_suggestion_logs" (
  "id"                TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "city"              VARCHAR(255)  NOT NULL,
  "category_slug"     VARCHAR(100)  NOT NULL,
  "unit"              VARCHAR(50)   NOT NULL,
  "season"            VARCHAR(50),
  "property_type"     VARCHAR(50),
  "distance_to_sea_km" DOUBLE PRECISION,
  "capacity"          INTEGER,
  "lat"               DOUBLE PRECISION,
  "lng"               DOUBLE PRECISION,

  "suggested_price"   DECIMAL(10,2) NOT NULL,
  "range_min"         DECIMAL(10,2) NOT NULL,
  "range_max"         DECIMAL(10,2) NOT NULL,
  "confidence"        VARCHAR(10)   NOT NULL,
  "comps_city"        INTEGER       NOT NULL,
  "comps_national"    INTEGER       NOT NULL,
  "w_city"            DOUBLE PRECISION NOT NULL,
  "w_national"        DOUBLE PRECISION NOT NULL,

  "input_json"        JSONB         NOT NULL,
  "output_json"       JSONB         NOT NULL,
  "adjustments"       JSONB,
  "explanation"       JSONB         NOT NULL,

  "listing_id"        TEXT,
  "final_price"       DECIMAL(10,2),
  "overridden"        BOOLEAN
);

CREATE INDEX IF NOT EXISTS "ai_price_suggestion_logs_createdAt_idx"
  ON "ai_price_suggestion_logs" ("createdAt");

CREATE INDEX IF NOT EXISTS "ai_price_suggestion_logs_city_category_slug_idx"
  ON "ai_price_suggestion_logs" ("city", "category_slug");

CREATE INDEX IF NOT EXISTS "ai_price_suggestion_logs_listing_id_idx"
  ON "ai_price_suggestion_logs" ("listing_id");
