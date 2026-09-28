-- ==========================================================================
-- Products gain many barcodes; physical stock counts become documents.
--
-- ORDER MATTERS. The generated diff dropped products.barcode before the
-- new table existed, which would have destroyed every barcode in the
-- shop. The column is only dropped here AFTER its data has been copied
-- across.
-- ==========================================================================

CREATE TYPE "BarcodeMode" AS ENUM ('SHARED', 'SERIALIZED');
CREATE TYPE "StockCountStatus" AS ENUM ('IN_PROGRESS', 'APPROVED', 'CANCELLED');

-- --------------------------------------------------------------------------
-- 1. The new barcode table
-- --------------------------------------------------------------------------
CREATE TABLE "product_barcodes" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "barcode" VARCHAR(64) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_barcodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_barcodes_barcode_key" ON "product_barcodes"("barcode");
CREATE INDEX "product_barcodes_productId_idx" ON "product_barcodes"("productId");
CREATE INDEX "product_barcodes_isActive_idx" ON "product_barcodes"("isActive");

ALTER TABLE "product_barcodes"
  ADD CONSTRAINT "product_barcodes_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- 2. Carry every existing barcode over as that product's primary code.
--    This must happen before the column is dropped.
-- --------------------------------------------------------------------------
INSERT INTO "product_barcodes" ("id", "productId", "barcode", "isPrimary", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", "barcode", true, true, NOW(), NOW()
  FROM "products"
 WHERE "barcode" IS NOT NULL AND btrim("barcode") <> '';

-- --------------------------------------------------------------------------
-- 3. Only now is it safe to remove the column
-- --------------------------------------------------------------------------
DROP INDEX "products_barcode_key";
ALTER TABLE "products" DROP COLUMN "barcode";

ALTER TABLE "products"
  ADD COLUMN "barcodeMode" "BarcodeMode" NOT NULL DEFAULT 'SHARED';

-- At most one primary barcode per product. Prisma cannot express a
-- partial unique index, so it lives here.
CREATE UNIQUE INDEX "product_barcodes_one_primary_per_product"
  ON "product_barcodes" ("productId")
  WHERE "isPrimary" = true;

-- --------------------------------------------------------------------------
-- 4. Stock counts
-- --------------------------------------------------------------------------
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "countNumber" VARCHAR(32) NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "note" VARCHAR(500),
    "startedById" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_count_items" (
    "id" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "systemQuantity" INTEGER NOT NULL,
    "countedQuantity" INTEGER NOT NULL DEFAULT 0,
    "variance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_count_scans" (
    "id" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "barcodeId" UUID NOT NULL,
    "barcode" VARCHAR(64) NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_count_scans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_counts_countNumber_key" ON "stock_counts"("countNumber");
CREATE INDEX "stock_counts_status_idx" ON "stock_counts"("status");
CREATE INDEX "stock_counts_startedAt_idx" ON "stock_counts"("startedAt");
CREATE INDEX "stock_count_items_stockCountId_idx" ON "stock_count_items"("stockCountId");
CREATE UNIQUE INDEX "stock_count_items_stockCountId_productId_key" ON "stock_count_items"("stockCountId", "productId");
CREATE INDEX "stock_count_scans_stockCountId_idx" ON "stock_count_scans"("stockCountId");
-- The guard that stops one physical unit being counted twice, and which
-- must survive saving a count as a draft and resuming it.
CREATE UNIQUE INDEX "stock_count_scans_stockCountId_barcode_key" ON "stock_count_scans"("stockCountId", "barcode");

ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_scans" ADD CONSTRAINT "stock_count_scans_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_scans" ADD CONSTRAINT "stock_count_scans_barcodeId_fkey" FOREIGN KEY ("barcodeId") REFERENCES "product_barcodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Counted quantities cannot be negative.
ALTER TABLE "stock_count_items"
  ADD CONSTRAINT "stock_count_item_counted_non_negative" CHECK ("countedQuantity" >= 0),
  ADD CONSTRAINT "stock_count_item_system_non_negative" CHECK ("systemQuantity" >= 0);

-- Document numbering, alongside the existing receipt/return/shift counters.
INSERT INTO "counters" ("name", "value", "updatedAt") VALUES ('stockcount', 0, NOW())
  ON CONFLICT ("name") DO NOTHING;
