# database/

Migrations and seed data do **not** live here.

The Prisma CLI requires them adjacent to `schema.prisma`, so they are at:

- `backend/prisma/migrations/` — versioned SQL migrations
- `backend/prisma/seed.ts` — development seed
- `backend/prisma/schema.prisma` — the data model

This directory holds operational database helpers (backup and restore scripts) and the
`backups/` output directory, which is gitignored.

See the main [README](../README.md#database) for migration, seed, backup and restore commands.
