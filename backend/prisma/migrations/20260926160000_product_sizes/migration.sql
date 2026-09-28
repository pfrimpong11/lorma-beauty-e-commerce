-- Sizes of one article are separate products sharing a group id. Everything a
-- size needs -- its own price, stock, barcodes, batches and stock-count lines
-- -- already hangs off a product row, so this adds the grouping and changes
-- nothing about how any of that works.
--
-- Existing products get NULL, meaning "no sizes", so nothing in the catalogue
-- is touched or has to be backfilled.
ALTER TABLE "products" ADD COLUMN "variantGroupId" UUID;
ALTER TABLE "products" ADD COLUMN "variantName" VARCHAR(40);
ALTER TABLE "products" ADD COLUMN "variantSort" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "products_variantGroupId_idx" ON "products" ("variantGroupId");

-- Two sizes in one group may not share a label. NULLs are distinct in
-- Postgres, so ungrouped products are unaffected by this.
CREATE UNIQUE INDEX "products_one_label_per_group"
  ON "products" ("variantGroupId", "variantName");

-- A group must be internally consistent: either a product is in a group and
-- has a label, or it is in neither.
ALTER TABLE "products" ADD CONSTRAINT "products_variant_pair"
  CHECK (("variantGroupId" IS NULL) = ("variantName" IS NULL));
