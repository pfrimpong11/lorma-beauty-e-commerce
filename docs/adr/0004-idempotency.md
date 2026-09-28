# 0004 — Idempotent sales for offline sync

**Status:** accepted

## Context

The POS must keep selling with no internet (§22) and sync when it returns (§24). Any retry
mechanism creates the same hazard: the client sends a sale, the network dies before the
response arrives, the client retries, and the shop has two sales and half the stock.

The spec is explicit — §51.10 and §51.11: synchronisation must be idempotent, and retrying
must never create a duplicate sale.

## Decision

Two independent guards, because either alone has a gap:

1. **`X-Idempotency-Key` header** — recorded in the `sync_queue` table with a `UNIQUE`
   constraint. Before doing any work, the service looks the key up; a hit returns the
   original sale with `duplicate: true` instead of creating a second one.
2. **`clientUuid` on the sale** — a `UNIQUE` column. The device generates it when the sale is
   completed, offline or online. Even if the idempotency key is lost, the same sale cannot
   land twice.

The uniqueness is enforced by the database, not by an application-level check, so two
concurrent retries racing each other still produce one sale.

`sync_queue` doubles as the conflict ledger: entries carry `status`
(`ACCEPTED` / `DUPLICATE` / `CONFLICT` / `REJECTED`), the original payload, and any conflict
detail, so an authorised user can resolve failures rather than losing the sale (§25).

## Consequences

- The client must generate and **persist** `clientUuid` in IndexedDB before attempting to
  send, and reuse the same value on every retry. Generating it per-attempt defeats the guard.
- A rejected sale is remembered: replaying its key returns the original rejection rather than
  silently retrying, so a sale invalid at sync time does not succeed later by chance.
- `sync_queue` grows monotonically and will need a retention policy once the shop is live.
