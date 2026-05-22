-- Dispute resolution: formal complaints about paid/completed bookings.
-- Opening a dispute holds the host payout via Booking.disputeStatus.
-- A timeline of DisputeMessage rows captures back-and-forth between
-- renter, host, and admin (with optional image evidence URLs).

CREATE TYPE "DisputeReason" AS ENUM (
  'NOT_AS_DESCRIBED',
  'DAMAGED',
  'NO_SHOW',
  'CANCELLED_LATE',
  'PAYMENT_ISSUE',
  'OTHER'
);

CREATE TYPE "DisputeResolution" AS ENUM (
  'PENDING',
  'REFUND_FULL',
  'REFUND_PARTIAL',
  'FAVOR_HOST',
  'DISMISSED'
);

CREATE TYPE "DisputeOpenedBy" AS ENUM ('RENTER', 'HOST');

CREATE TABLE "disputes" (
  "id"              TEXT NOT NULL,
  "booking_id"      TEXT NOT NULL,
  "opened_by_id"    TEXT NOT NULL,
  "opened_by_role"  "DisputeOpenedBy" NOT NULL,
  "reason"          "DisputeReason" NOT NULL,
  "description"     TEXT NOT NULL,
  "status"          "DisputeStatus" NOT NULL DEFAULT 'OPEN',
  "resolution"      "DisputeResolution" NOT NULL DEFAULT 'PENDING',
  "refund_amount"   DECIMAL(10,2),
  "resolved_by_id"  TEXT,
  "resolved_at"     TIMESTAMP(3),
  "resolver_notes"  TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "disputes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "disputes_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "disputes_opened_by_id_fkey"
    FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE INDEX "disputes_bookingId_idx" ON "disputes" ("booking_id");
CREATE INDEX "disputes_status_idx" ON "disputes" ("status");
CREATE INDEX "disputes_openedById_idx" ON "disputes" ("opened_by_id");

CREATE TABLE "dispute_messages" (
  "id"          TEXT NOT NULL,
  "dispute_id"  TEXT NOT NULL,
  "author_id"   TEXT NOT NULL,
  "is_admin"    BOOLEAN NOT NULL DEFAULT false,
  "body"        TEXT NOT NULL,
  "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispute_messages_dispute_id_fkey"
    FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dispute_messages_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE INDEX "dispute_messages_disputeId_idx" ON "dispute_messages" ("dispute_id");
