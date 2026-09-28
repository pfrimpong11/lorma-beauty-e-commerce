'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { adminNavFor, canUseBackOffice, canUseTill } from './nav-items';
import { Icon } from './Icon';
import { SyncIndicator } from './SyncIndicator';
import { SectionSwitcher } from './SectionSwitcher';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    // Preserve where they were headed, so a bookmarked back-office page
    // returns there after signing in rather than dumping them on a default.
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

  // A cashier holds no back-office permission; send them to the till
  // rather than rendering an empty sidebar.
  useEffect(() => {
    if (status === 'authenticated' && user && !canUseBackOffice(user.permissions)) {
      router.replace(canUseTill(user.permissions) ? '/till' : '/login');
    }
  }, [status, user, router]);

  useEffect(() => setMobileNavOpen(false), [pathname]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
      </div>
    );
  }

  const items = adminNavFor(user.permissions);
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const NavLinks = () => (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((item) => {
        const children = item.children ?? [];
        const groupActive = isActive(item.href) || children.some((c) => isActive(c.href));

        // A group renders as a heading plus its children, so the structure
        // in §41 stays visible rather than hidden behind a toggle.
        if (children.length > 1) {
          return (
            <div key={item.label} className="pt-3 first:pt-0">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                {item.label}
              </p>
              {children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive(child.href)
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                  )}
                  aria-current={isActive(child.href) ? 'page' : undefined}
                >
                  <Icon name={child.icon} />
                  {child.label}
                </Link>
              ))}
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              groupActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
            )}
            aria-current={groupActive ? 'page' : undefined}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const Brand = () => (
    <Link href="/admin/dashboard" className="flex flex-col px-5 py-4">
      <span className="text-sm font-semibold tracking-[0.16em] text-brand-700">LORMA BEAUTY</span>
      <span className="text-[10px] tracking-wide text-ink-subtle">Back Office</span>
    </Link>
  );

  const UserCard = () => (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {initials(user.firstName, user.lastName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs text-ink-subtle">{user.roleName}</p>
        </div>
        <button
          onClick={() => void logout()}
          aria-label="Sign out"
          title="Sign out"
          className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-danger"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-surface-sunken">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface-raised lg:flex">
        <Brand />
        <NavLinks />
        <UserCard />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-ink/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 flex h-full w-64 flex-col bg-surface-raised shadow-raised"
            >
              <Brand />
              <NavLinks />
              <UserCard />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface-raised/90 px-4 backdrop-blur">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>

          <span className="text-sm font-semibold tracking-[0.16em] text-brand-700 lg:hidden">
            LORMA BEAUTY
          </span>

          <div className="ml-auto flex items-center gap-2">
            <SyncIndicator />
            <SectionSwitcher />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
