# 0003 — Permission-based authorization

**Status:** accepted

## Context

§6 defines ADMIN and CASHIER, and requires that further roles can be added later without a
rewrite. The tempting shortcut — `if (user.role === 'ADMIN')` scattered through services —
makes every new role a code change and hides the real rule behind a label.

## Decision

Authorization is checked against **permissions**, never role names.

- `src/common/permissions.ts` holds the catalogue (38 codes, `resource.action` form).
- Roles are rows; `role_permissions` maps them. The seed grants ADMIN everything and CASHIER
  a deliberate subset.
- Routes declare `@RequirePermissions(PERMISSIONS.PRODUCT_UPDATE_PRICE)`; a global
  `PermissionsGuard` enforces it.
- Permissions travel in the access token, so the frontend can hide what the user cannot do —
  while the server still enforces it independently.

## Consequences

- Adding a Supervisor role is seed data plus a UI screen, not a code change.
- The access token grows with the permission list. At 38 codes this is a few hundred bytes;
  if it grows much further, switch to a role reference and a server-side lookup.
- Changing a role's permissions does not affect already-issued access tokens until they
  expire (15 minutes). Immediate revocation uses `tokenVersion`, which invalidates refresh
  tokens at once.
