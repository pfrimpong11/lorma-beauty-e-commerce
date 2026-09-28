# 0001 — Prisma as the data access layer

**Status:** accepted

## Context

The system needs a typed data layer over PostgreSQL with a dependable migration story,
first-class `DECIMAL` handling, and transactions strong enough to make a sale atomic across
six tables.

## Decision

Prisma, over TypeORM.

- Migrations are plain SQL files under version control, applied with `migrate deploy` in a
  one-shot container before the API starts.
- `Prisma.Decimal` maps to `NUMERIC` without a custom transformer.
- Interactive transactions (`$transaction(async tx => ...)`) let the sale span sale, items,
  payments, inventory, movements and audit in one unit.
- Generated types remove a whole class of column/field drift.

## Consequences

- Constructs Prisma cannot express — `CHECK` constraints, partial and trigram indexes — live
  in hand-written migration SQL. Where Prisma *can* represent something (a GIN index), it must
  also be declared in `schema.prisma` with a matching `map:`, or `migrate dev` reports drift.
- The runtime image must carry the Prisma CLI so migrations and seeding can run in-container.
- `prisma migrate dev` prompts interactively and must not be used in scripts or CI; use
  `migrate deploy`.
