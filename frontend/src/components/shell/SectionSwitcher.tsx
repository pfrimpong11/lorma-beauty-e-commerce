'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { canUseBackOffice, canUseTill } from './nav-items';
import { Icon } from './Icon';
import { cn } from '@/lib/cn';

/**
 * Moves between the two sections.
 *
 * Rendered only for someone who can actually reach both — a cashier holds
 * no back-office permission, so they never see a door they cannot open.
 */
export function SectionSwitcher({ compact = false }: { compact?: boolean }) {
  const user = useAuth((s) => s.user);
  const pathname = usePathname();

  if (!user) return null;

  const permissions = user.permissions;
  const bothSections = canUseTill(permissions) && canUseBackOffice(permissions);
  if (!bothSections) return null;

  const inTill = pathname.startsWith('/till');

  const target = inTill ? '/admin/dashboard' : '/till';
  const label = inTill ? 'Back office' : 'Open till';
  const icon = inTill ? 'backoffice' : 'pos';

  return (
    <Link
      href={target}
      title={inTill ? 'Switch to the back office' : 'Switch to the selling till'}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5',
        'text-xs font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-ink',
        compact && 'px-2',
      )}
    >
      <Icon name={icon} size={15} />
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
    </Link>
  );
}
