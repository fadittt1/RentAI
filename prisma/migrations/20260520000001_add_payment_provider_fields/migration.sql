-- Add provider integration fields to payment_intents
-- `provider` is null for simulated payments; populated when we route through a
-- real Tunisian gateway (flouci, konnect, d17).

ALTER TABLE "payment_intents"
  ADD COLUMN "provider"     VARCHAR(32),
  ADD COLUMN "provider_ref" VARCHAR(128),
  ADD COLUMN "redirect_url" VARCHAR(500),
  ADD COLUMN "paid_at"      TIMESTAMP(3);

CREATE INDEX "payment_intents_providerRef_idx" ON "payment_intents" ("provider_ref");
