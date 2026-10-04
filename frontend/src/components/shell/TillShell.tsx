'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { useCart } from '@/store/cart';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IdleWarning } from './IdleWarning';
import { tillNavFor, canUseTill } from './nav-items';
import { Icon } from './Icon';
import { SyncIndicator } from './SyncIndicator';

/**
 * Chrome for the selling section.
 *
 * Deliberately not the admin sidebar: at a counter the screen belongs to
 * the sale. A single slim bar carries only what a cashier needs mid-
 * transaction — where they are, whether their sales are syncing, and who
 * is signed in. Everything else is one tap away, not permanently on screen.
 */
export function TillShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, logout } = useAuth();
  // Signing out abandons whatever is in the cart, and the Logout control
  // now sits beside the tabs where a stray tap can reach it.
  const cartLines = useCart((s) => s.lines.length);
  const heldCount = useCart((s) => s.held.length);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

// An account created by an administrator is not the staff member's own
  // until they have set their own password, so nothing else opens first.
  useEffect(() => {
    if (status === 'authenticated' && user?.mustChangePassword) {
      router.replace('/change-password');
    }
  }, [status, user, router]);

  // A user without pos.access has no business in the till.
  useEffect(() => {
    if (status === 'authenticated' && user && !canUseTill(user.permissions)) {
      router.replace('/admin/dashboard');
    }
  }, [status, user, router]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
      </div>
    );
  }

  const items = tillNavFor(user.permissions);
  const isActive = (href: string) =>
    href === '/till' ? pathname === '/till' : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen flex-col bg-surface-sunken">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface-raised px-3 sm:px-4">
        <Link href="/till" className="flex shrink-0 flex-col leading-none">
          <span className="text-xs font-semibold tracking-[0.16em] text-brand-700">LORMA BEAUTY</span>
          <span className="mt-0.5 text-[10px] tracking-wide text-ink-subtle">Till</span>
        </Link>

        {/* Section tabs sit in the bar itself — no sidebar to steal width */}
        <nav className="ml-2 flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Till">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
              )}
            >
              <Icon name={item.icon} size={16} />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          ))}

          {/*
            Sign out sits with the tabs, labelled, because the icon-only
            control in the corner was the first thing to get clipped on a
            15" till and in the installed PWA — exactly where it matters.
          */}
          <button
            onClick={() => (cartLines > 0 ? setConfirmingSignOut(true) : void logout())}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" />
            </svg>
            {/* Always shown, unlike the tab labels — this one must never
                be reduced to an unlabelled glyph. */}
            <span>Logout</span>
          </button>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SyncIndicator />

          <span
            title={`${user.firstName} ${user.lastName} · ${user.roleName}`}
            className="flex h-8 w-8 items-center justify-center rounded-full border-l border-line bg-brand-100 text-xs font-semibold text-brand-700"
          >
            {initials(user.firstName, user.lastName)}
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1">{children}</main>

      <ConfirmDialog
        open={confirmingSignOut}
        onClose={() => setConfirmingSignOut(false)}
        onConfirm={() => logout()}
        title="Sign out with items in the cart?"
        tone="danger"
        confirmLabel="Sign out"
        message={
          `There ${cartLines === 1 ? 'is 1 item' : `are ${cartLines} items`} in the cart. ` +
          'Signing out clears it — the sale will not be recorded.' +
          // Held sales are on disk, so say so rather than let the cashier
          // assume they go the same way as the cart.
          (heldCount > 0
            ? ` ${heldCount} held sale${heldCount === 1 ? '' : 's'} will be kept on this device.`
            : '')
        }
      />

      {/* Signs out after a spell of inactivity; see useIdleLogout. */}
      <IdleWarning enabled={status === 'authenticated'} />

    </div>
  );
}
