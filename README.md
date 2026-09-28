# Lorma Beauty POS

Point of sale and retail management for **Lorma Beauty**, a skincare and beauty retailer.

Version 1 is an in-store system: sell fast, track stock accurately, manage staff and shifts,
and keep selling when the internet drops. The full specification lives in [PROMPT.md](PROMPT.md).

---

## Two sections

The application is split into two areas with separate layouts, because a
counter and a back office are different jobs.

```
/login                    one door for everyone
   │
   ├── sales rep  ──────▶  /till            SELLING
   │                         ├─ Sell         full-screen POS, keyboard-driven
   │                         ├─ My Shift     open / close, cash count
   │                         ├─ Receipts     find a sale, reprint, return
   │                         └─ Sync         offline queue
   │
   └── owner      ──────▶  /admin           BACK OFFICE
                             ├─ Dashboard
                             ├─ Sales · Returns
                             ├─ Products · Categories · Inventory · Expiry
                             ├─ Customers · Staff · Shifts
                             └─ Reports · Audit Log
```

**One login for everyone.** There is no separate sign-in page per section —
same staff directory, same credentials. Where you land is decided by what you
are allowed to do: a sales rep goes to the till, an owner to the back office.
A second login screen would duplicate the form and leak which section an email
belongs to.

**The till has no admin chrome.** No sidebar, no reporting navigation — a slim
bar with the sections a cashier needs mid-transaction and nothing else.

**Cashiers cannot reach the back office.** They hold none of the back-office
permissions, so `/admin` redirects them to the till and no switcher is shown.
An owner gets a switcher in the header to move between the two.

**Bookmarks survive.** `/till` signed out bounces to `/login?next=/till` and
returns there, so a tablet can be bookmarked straight to the counter. Paths
from before the split (`/pos`, `/dashboard`, …) redirect to their new homes.

Run `npm run check:sections` in `frontend/` to verify the routing invariants —
including that a sales rep can never be handed back-office navigation.

---

## Current state

Version 1 is feature-complete and runs end to end in Docker.

| Area | Status |
| --- | --- |
| PostgreSQL schema — 21 tables, 25 check constraints, partial unique indexes | Done |
| Docker stack — postgres / migrate / backend / frontend, multi-stage builds | Done |
| Health checks — `/health`, `/health/live`, `/health/ready`, 503 when DB is down | Done |
| Authentication — JWT access token + httpOnly refresh cookie, bcrypt | Done |
| Roles & permissions — 38 permissions, ADMIN / CASHIER | Done |
| Two sections — separate till and back-office shells, permission-routed | Done |
| Barcode scanning — Newland FR20 (HID-KBW), scan-to-cart, settings and test screen | Done |
| POS — search, barcode scanning, cart, discounts, hold/retrieve, payment, receipt | Done |
| Till receipt lookup — reprint and process a return at the counter | Done |
| Sales — atomic transaction, idempotent retry, immutable history | Done |
| Inventory — stock in, adjust, write-off, FEFO batch consumption, movement ledger | Done |
| Expiry — batch tracking, warning window, expired stock cannot be sold | Done |
| Returns & refunds — against the original sale, restock or write-off | Done |
| Shifts — open, close, expected cash, variance with mandatory reason | Done |
| Customers, staff, roles | Done |
| Category management — add, edit, deactivate | Done |
| Product management — add, edit, change price with a recorded reason | Done |
| Barcodes — many per product, primary/retire, duplicate detection | Done |
| Receive stock — scan a delivery in, confirmed as one transaction | Done |
| Stock counts — scan-driven, variance review, approval adjusts stock | Done |
| Inventory movement history | Done |
| Stock movements — receive, adjust to a count, write off damaged/expired | Done |
| Reports — 5 reports with date filtering, Excel + PDF export | Done |
| Audit log — every significant action, with a readable summary | Done |
| Tests — 17 unit + 41 integration | Done |
| PWA — installable, service worker, offline shell | Done |
| Offline — IndexedDB queue, survives refresh, automatic sync, conflict handling | Done |


**Known gaps.** These are deliberate omissions, not oversights:

- Receipt delivery by email, SMS and WhatsApp is designed for but not implemented; §16 allows
  this, and the receipt model is ready for it.
- The backend image is ~772MB. Around 210MB of that is the Prisma toolchain
  (`@prisma/client` pulls `typescript`, the CLI pulls `effect`), which the image needs in
  order to run `prisma migrate deploy`. Dropping the CLI would split this into two images and
  break the single-artifact promotion model.

## Technology

- **Frontend** — Next.js, TypeScript, Tailwind CSS, Framer Motion, Poppins, PWA
- **Backend** — NestJS, TypeScript, REST
- **Database** — PostgreSQL 16 with Prisma
- **Containers** — Docker and Docker Compose

---

## Quick start

```bash
cp .env.example .env          # then edit: set real secrets
docker compose build
docker compose up -d
docker compose logs -f
```

The stack starts in order: Postgres becomes healthy, the one-shot `migrate` service applies
migrations, then the API starts, then the frontend.

| Service | URL |
| --- | --- |
| Till (selling) | http://localhost:3200/till |
| Back office | http://localhost:3200/admin |
| API | http://localhost:4000/api/v1 |
| API docs (non-production) | http://localhost:4000/api/docs |
| Health | http://localhost:4000/health |

### Reaching it from another device

```bash
./scripts/share.sh          # starts in tunnel mode and opens an ngrok tunnel
```

Needed for testing the PWA, the responsive layouts or the scanner on real
hardware — a tunnel gives HTTPS, which service workers require and a plain LAN
address cannot provide. It proxies the API under the frontend's own origin, so
one tunnel is enough and the session cookie stays first-party.
[docs/deployment/tunnel.md](docs/deployment/tunnel.md).

### Signing in as two people at once

One browser profile holds **one** session. The refresh cookie has a single
slot, so signing in as a second user in another tab silently takes over the
first — the original tab will come back as the new user on its next refresh.

That is deliberate: a till should not hold two identities at once, or sales
start getting attributed to the wrong cashier.

To run both side by side, give each session its own cookie jar:

| Setup | How |
| --- | --- |
| Two devices *(what the shop will do)* | POS terminal signed in as the cashier, laptop or phone as the owner |
| One machine, two browsers | Chrome for one, Firefox or Safari for the other |
| One machine, one browser | A normal window and a private/incognito window |
| One machine, Chrome only | Two Chrome profiles |

Note that an **admin does not need a second login to use the till** — an admin
already holds `pos.access`. Two sessions are only needed to see the cashier's
restricted view at the same time as the back office.

### Development

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Source is bind-mounted and both apps run in watch mode. Postgres is published on the host so
you can attach `psql` or a GUI.

> **Host port note.** Two published ports are shifted off their defaults because those are
> commonly already in use: Postgres is on **5433** (not 5432) and the frontend on **3200**
> (not 3000). Change `POSTGRES_PORT` / `FRONTEND_PORT` in `.env` to suit your machine, and
> keep `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` in step with them. Inside the `lorma-net`
> network the ports are always 5432, 4000 and 3000, addressed by service name.

Running Prisma from the host (rather than inside a container) needs the host port:

```bash
cd backend
export DATABASE_URL="postgresql://lorma:<password>@localhost:5433/lorma_beauty_pos?schema=public"
npx prisma migrate status
```

---

## Database

```bash
# Apply migrations (what the `migrate` service runs)
docker compose run --rm migrate

# Load development seed data
docker compose exec backend node dist/database/seed.js

# Open a psql shell
docker exec -it lorma-postgres psql -U lorma -d lorma_beauty_pos
```

Data lives in the named volume `lorma-postgres-data`. `docker compose down` keeps it;
`docker compose down -v` destroys it. Rebuilding images never touches it.

For production, point `DATABASE_URL` at a managed PostgreSQL instance instead — nothing in
the application assumes the database is the container.

### Backup and restore

```bash
# Backup
docker exec lorma-postgres pg_dump -U lorma -Fc lorma_beauty_pos > backups/$(date +%F).dump

# Restore
docker exec -i lorma-postgres pg_restore -U lorma -d lorma_beauty_pos --clean < backups/2026-09-21.dump
```

---

## Seed data

Development credentials. **Never use these in production.**

| Role | Email | Password |
| --- | --- | --- |
| Admin / Owner | `admin@lormabeauty.local` | `LormaAdmin!2024` |
| Cashier | `cashier@lormabeauty.local` | `LormaCashier!2024` |

The seed is idempotent — rerunning it converges rather than duplicating. It creates 10
categories, 27 products with batches and expiry dates (including deliberate low-stock,
out-of-stock and near-expiry cases for testing dashboards), the Walk-in Customer, 3 demo
customers and 10 settings keys.

---

## Environment variables

Everything is configured through the environment; nothing environment-specific is compiled in.
See [.env.example](.env.example) for the full list with comments. The API validates its
environment at boot and refuses to start on a missing or too-short secret, so a misconfigured
container fails loudly instead of running half-broken.

Generate secrets with:

```bash
openssl rand -base64 48
```

---

## Project structure

```
backend/          NestJS API
  prisma/         schema, migrations, seed
  src/
    auth/         login, refresh, JWT strategy
    common/       permissions, money, guards, filters
    health/       container health endpoints
    inventory/    stock movement engine
    products/     catalogue read side
    sales/        the atomic sale transaction
frontend/         Next.js PWA (not yet implemented)
database/         backup and restore helpers
docs/adr/         architecture decision records
```

Migrations live in `backend/prisma/migrations` rather than `/database/migrations`, because
the Prisma CLI requires them adjacent to `schema.prisma`.

---

## Hardware — barcode scanning

| Device | Mode | Status |
| --- | --- | --- |
| Newland FR20 2D Scanner (S/N FR20E25310017) | USB HID-KBW + ENTER suffix | Integrated |
| AnyPay thermal receipt printer | 80mm, workstation driver | Integrated |

The scanner is another way to pick a product, not a separate system. It
resolves a barcode to the same product object the POS already uses and hands it
to the same add-to-cart call the product grid uses — prices, stock, expiry and
totals are unchanged.

Scanning is always ready on **Till → Sell**. No button, no modal, no field to
click. Scan → product appears in the cart → scan the next one. Scanning the
same product again increments its quantity.

The search box accepts both: `Search product or scan barcode…`. Typing is never
mistaken for a scan — only input arriving at machine speed is treated as one.

Receipts print through the workstation's printer driver — no backend
involvement, no browser extensions. **Till → Devices** holds both devices'
settings and a test print, and can print silently once the browser is launched
with kiosk printing.

Setup, testing without the hardware, and troubleshooting:
[scanner](docs/hardware/newland-fr20.md) ·
[printer](docs/hardware/anypay-printer.md) ·
[barcodes & stock](docs/hardware/barcodes-and-stock.md).

---

## Responsive

Built for the hardware it runs on, not just a browser window.

| Target | Handling |
| --- | --- |
| 15" POS terminal (1024×768, 1366×768) | `short:` variants compact vertical padding so the product grid keeps its rows on a 768px-tall screen |
| Touch terminals and tablets | `touch:` variants enlarge every control the cashier uses mid-sale to a 44px minimum |
| Phones | The cart becomes a bottom sheet with a permanent total bar, so the catalogue keeps the full screen |
| Any mobile browser | Heights use `dvh`, so a shifting URL bar can never push the checkout button below the fold |

---

## Architecture decisions

Short records of the decisions that are expensive to reverse:

- [0001 — Prisma as the data access layer](docs/adr/0001-prisma.md)
- [0002 — Money is DECIMAL, never float](docs/adr/0002-money.md)
- [0003 — Permission-based authorization](docs/adr/0003-permissions.md)
- [0004 — Idempotent sales for offline sync](docs/adr/0004-idempotency.md)
- [0005 — Runtime configuration for the frontend image](docs/adr/0005-runtime-config.md)

---

## Testing

```bash
cd backend
npm test           # 17 unit tests — money arithmetic, permission guard
npm run test:e2e   # 41 integration tests against a real PostgreSQL database
```

Frontend section routing:

```bash
cd frontend
npm run check            # all frontend checks (101)
npm run check:sections   # till / back-office split
npm run check:modal-focus # dialog focus regressions
npm run check:scanner    # barcode decoder against a simulated DOM
npm run check:scan-to-cart # scan -> lookup -> cart, end to end
npm run check:responsive # viewport, touch targets, print layout
npm run check:proxy      # same-origin API proxy for tunnelled access
```

The integration suite runs from the host, so it needs Postgres **published to the host**.
The production stack deliberately does not expose the database — start it with the dev
overlay first, or the suite will fail with connection timeouts:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

Then create the test database once:

```bash
docker exec lorma-postgres psql -U lorma -d postgres -c "CREATE DATABASE lorma_test;"
export DATABASE_URL="postgresql://lorma:<password>@localhost:5433/lorma_test?schema=public"
npx prisma migrate deploy && npm run db:seed
```

It covers all 16 scenarios required by §46, including the ones that matter most: a sale
reduces inventory atomically, a sale cannot exceed stock, duplicate synchronisation cannot
create a duplicate sale, a failed sync is preserved rather than lost, and expired stock
cannot be sold.

---

## Troubleshooting

**`port is already allocated` on startup** — something else holds 5432 or 3000. Change
`POSTGRES_PORT` / `FRONTEND_PORT` in `.env`.

**`P3005: database schema is not empty`** — the migration ledger is missing but tables exist.
Baseline rather than reset:

```bash
npx prisma migrate resolve --applied <migration_name>
```

**Tests fail with connection timeouts** — Postgres is not published to the host. The
production compose file keeps the database on the internal network by design; start it with
the dev overlay (above) before running host-side tests or Prisma commands.

**Health check reports `degraded`** — the API is up but cannot reach the database. Check
`docker compose logs postgres` and that `DATABASE_URL` uses the service name `postgres`, not
`localhost`.

**Prisma reports drift after adding a raw-SQL index** — Prisma compares indexes it can
represent. Declare the index in `schema.prisma` with an explicit `map:` matching the name
used in the migration.
