-- Deleting a product must free its barcodes for reuse, and deleting a barcode
-- must not erase the record of it having been scanned during a stock count.
-- The scan row already stores the code as a string, which is the part that
-- matters; the foreign key is a convenience, so it is allowed to go null
-- rather than take the row with it.
ALTER TABLE "stock_count_scans" ALTER COLUMN "barcodeId" DROP NOT NULL;

ALTER TABLE "stock_count_scans" DROP CONSTRAINT "stock_count_scans_barcodeId_fkey";

ALTER TABLE "stock_count_scans"
  ADD CONSTRAINT "stock_count_scans_barcodeId_fkey"
  FOREIGN KEY ("barcodeId") REFERENCES "product_barcodes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
