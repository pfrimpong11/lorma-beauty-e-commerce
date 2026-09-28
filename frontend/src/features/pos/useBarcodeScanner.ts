'use client';

import { useEffect, useRef } from 'react';

/**
 * POS keyboard shortcuts (§28). Ignored while a modifier-free key is typed
 * into a field, so F-keys work but ordinary typing is untouched.
 */
export function usePosShortcuts(handlers: {
  onSearch?: () => void;
  onCustomer?: () => void;
  onHold?: () => void;
  onCheckout?: () => void;
  onGlobalSearch?: () => void;
}): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const h = ref.current;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        h.onGlobalSearch?.();
        return;
      }

      switch (event.key) {
        case 'F2':
          event.preventDefault();
          h.onSearch?.();
          break;
        case 'F4':
          event.preventDefault();
          h.onCustomer?.();
          break;
        case 'F8':
          event.preventDefault();
          h.onHold?.();
          break;
        case 'F9':
          event.preventDefault();
          h.onCheckout?.();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
