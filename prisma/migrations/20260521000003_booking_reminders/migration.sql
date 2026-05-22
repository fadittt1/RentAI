-- Abandoned-booking nudges: track which reminders the cron has sent so we
-- never double-message a renter. Both columns null at booking creation.

ALTER TABLE "bookings"
  ADD COLUMN "pending_reminder_sent_at"        TIMESTAMP(3),
  ADD COLUMN "pending_final_reminder_sent_at"  TIMESTAMP(3);

-- Composite-friendly index for the cron's hot query:
--   WHERE status = 'pending' AND paid = false AND created_at < <cutoff>
--     AND (pending_reminder_sent_at IS NULL OR pending_final_reminder_sent_at IS NULL)
-- Existing (status) index is enough; this just helps the cutoff scan.
CREATE INDEX "bookings_pending_reminder_idx"
  ON "bookings" ("status", "pending_reminder_sent_at", "createdAt");
