-- ==========================================================================
-- Integrity constraints that the Prisma schema language cannot express.
--
-- These enforce the business rules from PROMPT.md §51 at the database
-- level, so they hold even if application code is bypassed or a future
-- service forgets a check.
-- ==========================================================================

-- Case-insensitive / fuzzy product search (POS speed, §42)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --------------------------------------------------------------------------
-- Stock can never go negative
-- --------------------------------------------------------------------------
ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_quantity_non_negative" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "inventory_reserved_non_negative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "inventory_reserved_within_quantity" CHECK ("reserved" <= "quantity");

ALTER TABLE "product_batches"
  ADD CONSTRAINT "batch_quantity_non_negative" CHECK ("quantity" >= 0);

-- --------------------------------------------------------------------------
-- Money is never negative, and prices are sane
-- --------------------------------------------------------------------------
ALTER TABLE "products"
  ADD CONSTRAINT "product_cost_non_negative" CHECK ("costPrice" >= 0),
  ADD CONSTRAINT "product_price_non_negative" CHECK ("sellingPrice" >= 0),
  ADD CONSTRAINT "product_min_stock_non_negative" CHECK ("minStockLevel" >= 0);

ALTER TABLE "sales"
  ADD CONSTRAINT "sale_subtotal_non_negative" CHECK ("subtotal" >= 0),
  ADD CONSTRAINT "sale_total_non_negative" CHECK ("total" >= 0),
  ADD CONSTRAINT "sale_discount_non_negative" CHECK ("discountAmount" >= 0),
  ADD CONSTRAINT "sale_refund_non_negative" CHECK ("amountRefunded" >= 0),
  -- Cannot refund more than was actually paid
  ADD CONSTRAINT "sale_refund_within_total" CHECK ("amountRefunded" <= "total");

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_item_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "sale_item_price_non_negative" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "sale_item_line_total_non_negative" CHECK ("lineTotal" >= 0),
  ADD CONSTRAINT "sale_item_returned_non_negative" CHECK ("quantityReturned" >= 0),
  -- Cannot return more units than were sold on that line
  ADD CONSTRAINT "sale_item_returned_within_sold" CHECK ("quantityReturned" <= "quantity");

ALTER TABLE "payments"
  ADD CONSTRAINT "payment_amount_non_negative" CHECK ("amount" >= 0),
  ADD CONSTRAINT "payment_tendered_covers_amount"
    CHECK ("amountTendered" IS NULL OR "amountTendered" >= "amount");

ALTER TABLE "returns"
  ADD CONSTRAINT "return_refund_non_negative" CHECK ("refundAmount" >= 0);

ALTER TABLE "return_items"
  ADD CONSTRAINT "return_item_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "return_item_refund_non_negative" CHECK ("refundAmount" >= 0);

ALTER TABLE "shifts"
  ADD CONSTRAINT "shift_opening_cash_non_negative" CHECK ("openingCash" >= 0),
  ADD CONSTRAINT "shift_closing_cash_non_negative"
    CHECK ("closingCash" IS NULL OR "closingCash" >= 0),
  -- A closed shift must carry its closing figures
  ADD CONSTRAINT "shift_closed_has_figures" CHECK (
    "status" <> 'CLOSED'
    OR ("closedAt" IS NOT NULL AND "closingCash" IS NOT NULL AND "expectedCash" IS NOT NULL)
  );

-- --------------------------------------------------------------------------
-- §51.15 — a cashier may hold at most one OPEN shift.
-- Enforced here rather than only in the service, so a race between two
-- devices cannot open two shifts for the same cashier.
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX "shifts_one_open_per_cashier"
  ON "shifts" ("cashierId")
  WHERE "status" = 'OPEN';

-- --------------------------------------------------------------------------
-- Exactly one Walk-in Customer row
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX "customers_single_walk_in"
  ON "customers" ("isWalkIn")
  WHERE "isWalkIn" = true;

-- --------------------------------------------------------------------------
-- Search indexes — product lookup by name/SKU/brand must stay fast as the
-- catalogue grows (§42)
-- --------------------------------------------------------------------------
CREATE INDEX "products_name_trgm" ON "products" USING gin ("name" gin_trgm_ops);
CREATE INDEX "products_sku_trgm" ON "products" USING gin ("sku" gin_trgm_ops);
CREATE INDEX "products_brand_trgm" ON "products" USING gin ("brand" gin_trgm_ops)
  WHERE "brand" IS NOT NULL;

-- Active-catalogue listing is the hottest read path on the POS
CREATE INDEX "products_active_category" ON "products" ("isActive", "categoryId")
  WHERE "isActive" = true;

-- Expiry dashboards scan forward from today over non-empty batches
CREATE INDEX "batches_expiry_available" ON "product_batches" ("expiryDate")
  WHERE "quantity" > 0;
