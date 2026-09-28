'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ReactElement } from 'react';
import { useToasts, type ToastVariant } from '@/store/toast';
import { cn } from '@/lib/cn';

const STYLES: Record<ToastVariant, { box: string; icon: string; label: string }> = {
  success: { box: 'border-success/30 bg-success/10', icon: 'text-success', label: 'Success' },
  error: { box: 'border-danger/30 bg-danger/10', icon: 'text-danger', label: 'Error' },
  warning: { box: 'border-warning/30 bg-warning/10', icon: 'text-warning', label: 'Warning' },
  info: { box: 'border-info/30 bg-info/10', icon: 'text-info', label: 'Info' },
};

const ICONS: Record<ToastVariant, ReactElement> = {
  success: <path d="m5 13 4 4L19 7" />,
  error: <path d="M18 6 6 18M6 6l12 12" />,
  warning: <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  info: <path d="M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:items-end"
      // Assertive: a failed sale must interrupt, not wait for a pause.
      role="region"
      aria-live="assertive"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const style = STYLES[t.variant];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 16, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3 shadow-raised backdrop-blur',
                'bg-surface-raised',
                style.box,
              )}
            >
              <svg
                className={cn('mt-0.5 shrink-0', style.icon)}
                width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden
              >
                {ICONS[t.variant]}
              </svg>
              <div className="min-w-0 flex-1">
                {/* Text label so status is never colour-only (§43) */}
                <span className="sr-only">{style.label}: </span>
                <p className="text-sm font-medium text-ink">{t.message}</p>
                {t.description && <p className="mt-0.5 text-xs text-ink-muted">{t.description}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="-m-1 rounded p-1 text-ink-subtle transition-colors hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
