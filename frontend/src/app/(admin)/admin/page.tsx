'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { landingPath } from '@/components/shell/nav-items';

/** /admin on its own resolves to the first section this user can open. */
export default function AdminIndex() {
  const router = useRouter();
  const user = useAuth((s) => s.user);

  useEffect(() => {
    if (user) router.replace(landingPath(user.permissions));
  }, [user, router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
    </div>
  );
}
