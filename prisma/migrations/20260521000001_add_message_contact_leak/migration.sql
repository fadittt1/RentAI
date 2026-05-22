-- Anti-leak: flag chat messages where the user tried to share contact info
-- (phone, email, social handle, off-platform URL). The actual contact info is
-- masked before persisting, so the `content` column is safe to display — these
-- columns just record that a leak attempt happened, for admin telemetry and
-- repeat-offender detection.

ALTER TABLE "messages"
  ADD COLUMN "contact_leak"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contact_leak_kinds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "messages_contactLeak_idx" ON "messages" ("contact_leak");
