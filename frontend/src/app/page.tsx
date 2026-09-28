'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { landingPath } from '@/components/shell/nav-items';

/**
 * Entry point. Sends each user to their own section: a sales rep lands on
 * the till, an owner on the back office.
 */
export default function Home() {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'anonymous' || !user) {
      router.replace('/login');
      return;
    }
    router.replace(landingPath(user.permissions));
  }, [status, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        <p className="text-sm text-ink-subtle">Loading Lorma Beauty POS…</p>
      </div>
    </div>
  );
}
