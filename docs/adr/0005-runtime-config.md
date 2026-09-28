# 0005 — Runtime configuration for the frontend image

**Status:** accepted

## Context

Next.js inlines `NEXT_PUBLIC_*` variables into the JavaScript bundle at **build** time. A
frontend image built with `NEXT_PUBLIC_API_URL=http://localhost:4000` has that value welded
into it and cannot be pointed at a staging or production API without rebuilding.

That directly contradicts §34 ("do not hardcode environment-specific configuration") and
§38's premise that the same image is promoted between environments.

## Decision

The frontend image contains **no** environment-specific values.

The root layout is a server component: it reads `process.env` at request time and injects a
`window.__LORMA_CONFIG__` object into the HTML. Client code reads configuration from there
via `src/lib/runtime-config.ts`, never from `process.env` directly.

Compose passes `API_URL`, `APP_NAME`, `CURRENCY`, `CURRENCY_LOCALE` and
`EXPIRY_WARNING_DAYS` to the frontend service as plain (not `NEXT_PUBLIC_`) variables.

## Consequences

- Changing the API URL is a container **restart**, not a rebuild.
- One image artifact is promoted unchanged from dev to staging to production.
- The injected config is public — it is visible in page source, so it must never carry
  secrets. Anything sensitive stays server-side.
- The service worker caches the shell, so the config script must be part of the HTML
  document rather than a separately cached asset that could go stale.
