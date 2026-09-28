-- ==========================================================================
-- Remove index duplication introduced alongside the trigram indexes.
--
-- `products_name_idx` (btree) is fully superseded by `products_name_trgm`
-- for the POS search path, and `products_sku_trgm` duplicates the unique
-- btree that already backs the SKU constraint. Carrying both of each cost
-- write throughput for no read benefit, and made `prisma migrate dev`
-- report phantom drift against schema.prisma.
-- ==========================================================================

DROP INDEX IF EXISTS "products_name_idx";
DROP INDEX IF EXISTS "products_sku_trgm";
