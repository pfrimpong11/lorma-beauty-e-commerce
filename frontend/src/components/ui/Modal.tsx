'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { focusableWithin, pickFocusTarget } from './focus';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Held in a ref so the key handler below does not depend on onClose's
  // identity. Callers pass an inline arrow, which changes every render —
  // re-running the effect on each keystroke is what made the dialog steal
  // focus back while the user was still typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }

      // Keep tab focus inside the dialog while it is open.
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = focusableWithin(panelRef.current, document.activeElement);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  /**
   * Move focus into the dialog once, when it opens.
   *
   * Depends on `open` alone: re-running this on any other change would
   * yank the caret out of whatever the user is typing in.
   */
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;

      const target = pickFocusTarget(panel);
      target?.focus();

      // Put the caret at the end rather than selecting the value, so
      // typing appends instead of replacing what is already there.
      if (target instanceof HTMLInputElement && target.type !== 'number') {
        const end = target.value.length;
        target.setSelectionRange(end, end);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [open]);

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              // dvh so a dialog cannot grow taller than a mobile viewport,
              // and short: keeps it usable on a 768px POS screen.
              'relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface-raised shadow-raised sm:rounded-2xl',
              widths[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-ink-subtle">{description}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="-m-1 rounded-lg p-1 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
