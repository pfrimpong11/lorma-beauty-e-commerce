'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useCart } from '@/store/cart';
import { useIdleLogout } from '@/hooks/useIdleLogout';

/**
 * The last minute before an idle session ends.
 *
 * Shown rather than simply signing out, because a till that empties itself
 * with no explanation reads as a fault — and the cashier who comes back
 * from the stockroom deserves a button, not a login screen.
 */
export function IdleWarning({ enabled }: { enabled: boolean }) {
  const { warning, secondsLeft, staySignedIn } = useIdleLogout(enabled);
  const cartLines = useCart((s) => s.lines.length);

  return (
    <Modal
      open={warning}
      // Closing it is the same as staying: the only way to end the session
      // early is to sign out deliberately.
      onClose={staySignedIn}
      title="Still there?"
      size="sm"
      footer={
        <Button size="lg" onClick={staySignedIn} data-autofocus>
          Stay signed in
        </Button>
      }
    >
      <p className="text-sm text-ink">
        This session has been idle for a while and will sign out in{' '}
        <span className="font-semibold tabular text-ink">{secondsLeft}s</span>.
      </p>

      {cartLines > 0 && (
        <p className="mt-2 text-sm text-ink-subtle">
          {cartLines === 1 ? 'The item' : `All ${cartLines} items`} in the cart will be held, and
          will be waiting under Held transactions when you sign back in.
        </p>
      )}
    </Modal>
  );
}
