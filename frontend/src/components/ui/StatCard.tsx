import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './States';

export function StatCard({
  label,
  value,
  sublabel,
  tone = 'neutral',
  icon,
  loading,
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
  icon?: ReactNode;
  loading?: boolean;
}) {
  const tones = {
    neutral: 'text-ink',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    brand: 'text-brand-700',
  };

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
        {icon && <span className="text-ink-subtle">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className={cn('mt-1.5 text-2xl font-semibold tabular', tones[tone])}>{value}</p>
      )}
      {sublabel && <p className="mt-0.5 text-xs text-ink-subtle">{sublabel}</p>}
    </div>
  );
}
