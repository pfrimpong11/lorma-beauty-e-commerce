# 0002 — Money is DECIMAL, never float

**Status:** accepted

## Context

A POS adds, discounts and splits monetary amounts thousands of times a day, then reconciles
the result against physical cash in a drawer at the end of every shift.

IEEE-754 doubles cannot represent most decimal fractions exactly. `0.1 + 0.2` is
`0.30000000000000004`. Errors of this kind accumulate across line items and compound through
percentage discounts.

The consequence is not abstract: it shows up as a cash variance the cashier cannot explain
and the owner cannot trust.

## Decision

- Every monetary column is `NUMERIC(12,2)` in PostgreSQL, surfaced as `Prisma.Decimal`.
- All arithmetic goes through `src/common/utils/money.ts`, which rounds half-up to 2 decimal
  places at every step.
- Money crosses the API as a **fixed-scale string** (`"280.00"`), never a JSON number, so
  `JSON.parse` cannot silently convert it to a float in the browser.
- DTOs validate incoming money with `@IsNumberString()`, not `@IsNumber()`.
- Database `CHECK` constraints reject negative totals, refunds and payments.

## Consequences

- Frontend code must not do arithmetic on these strings with `parseFloat` before summing.
  Totals are computed server-side and returned; the client displays them.
- Comparisons use the helpers (`eq`, `gt`), not `===`, because `Decimal` is an object.
- Sorting by amount happens in SQL, where the column is numeric.
