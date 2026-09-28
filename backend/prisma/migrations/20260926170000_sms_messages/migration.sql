-- Every message the shop tried to send, recorded whether or not a provider is
-- configured and whether or not it succeeded. A receipt SMS that failed
-- silently is worse than one never attempted: the cashier believes the
-- customer has been told.
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

CREATE TABLE "sms_messages" (
  "id"          UUID NOT NULL,
  "toPhone"     VARCHAR(32) NOT NULL,
  "body"        TEXT NOT NULL,
  "status"      "SmsStatus" NOT NULL DEFAULT 'QUEUED',
  "provider"    VARCHAR(40),
  "providerRef" VARCHAR(120),
  "error"       TEXT,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "saleId"      UUID,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"      TIMESTAMP(3),
  CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sms_messages_status_idx" ON "sms_messages" ("status");
CREATE INDEX "sms_messages_saleId_idx" ON "sms_messages" ("saleId");

-- The sale may be removed without taking its message log with it.
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
