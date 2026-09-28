-- Adjustment arising from an approved stock count, kept distinct from a
-- manual ADJUSTMENT so a count's effect on stock stays traceable.
--
-- In its own migration because PostgreSQL will not let a newly added
-- enum value be used in the same transaction that adds it.
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'STOCK_COUNT';
