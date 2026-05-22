-- WhatsApp concierge: per-phone-number conversation state.
-- One row per WhatsApp user; updated on every inbound message. The bot uses
-- `last_result_ids` so that a follow-up like "tell me about #2" can be
-- resolved against what the bot just showed the user.

CREATE TABLE "whatsapp_conversations" (
  "id"               TEXT NOT NULL,
  "phone_number"     VARCHAR(32) NOT NULL,
  "user_id"          TEXT,
  "last_query"       TEXT,
  "last_result_ids"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "last_filters"     JSONB,
  "last_message_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "message_count"    INTEGER NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_conversations_phone_number_key" ON "whatsapp_conversations" ("phone_number");
CREATE INDEX "whatsapp_conversations_user_id_idx" ON "whatsapp_conversations" ("user_id");
CREATE INDEX "whatsapp_conversations_last_message_at_idx" ON "whatsapp_conversations" ("last_message_at");
