-- In-app notifications: one row per actionable event for a user.
-- The bell icon in the header shows the unread count; clicking an entry
-- opens the linked URL. `kind` is a short opaque string the frontend uses
-- to pick an icon/colour.

CREATE TABLE "notifications" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "kind"       VARCHAR(64) NOT NULL,
  "title"      VARCHAR(255) NOT NULL,
  "body"       TEXT,
  "link"       VARCHAR(500),
  "payload"    JSONB,
  "read_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "notifications_userId_createdAt_idx"
  ON "notifications" ("user_id", "created_at" DESC);
CREATE INDEX "notifications_userId_readAt_idx"
  ON "notifications" ("user_id", "read_at");
