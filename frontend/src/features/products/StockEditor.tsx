'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/store/toast';
import { useAuth } from '@/store/auth';

/**
 * Correcting the stock figure on a product that already exists.
 *
 * This is a correction, not a receipt of goods: it says "the shelf holds a
 * different number than the system thinks". That is why a reason is
 * required and why it writes an ADJUSTMENT to the ledger — a stock figure
 * that changes with nothing explaining it is the thing that makes a count
 * impossible to trust later.
 *
 * Stock arriving from a supplier belongs in Receive stock instead, which
 * records what it cost and which batch it came in on.
 */
export function StockEditor({
  productId,
  productName,
  currentStock,
  tracksExpiry,
}: {
  productId: string;
  productName: string;
  currentStock: number;
  tracksExpiry: boolean;
}) {
  const canAdjust = useAuth((s) => s.can('inventory.adjust'));
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(currentStock));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!canAdjust) return null;

  const next = Number(quantity);
  const delta = next - currentStock;
  // A batch-tracked product cannot simply be raised: the new units carry an
  // expiry that only Receive stock asks for. The server refuses it too.
  const raisingBatched = tracksExpiry && delta > 0;

  const invalid =
    quantity === '' ||
    Number.isNaN(next) ||
    next < 0 ||
    delta === 0 ||
    reason.trim().length < 3 ||
    raisingBatched;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/inventory/adjust', {
        productId,
        newQuantity: next,
        reason: reason.trim(),
      });
      for (const key of ['products', 'inventory', 'dashboard', 'expiry']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(`${productName} is now ${next} in stock.`);
      setOpen(false);
      setReason('');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The stock could not be corrected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Stock on hand</p>
          <p className="text-xs text-ink-subtle">
            {currentStock} in stock.{' '}
            {tracksExpiry
              ? 'Held in batches — new stock comes in through Receive stock.'
              : 'Correct it here if the shelf says otherwise.'}
          </p>
        </div>
        {!open && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Correct
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4 rounded-lg bg-surface-sunken p-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Counted quantity"
              type="number"
              min={0}
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              hint={
                delta === 0
                  ? 'Same as the current figure'
                  : `${delta > 0 ? '+' : ''}${delta} against the current ${currentStock}`
              }
              error={
                raisingBatched
                  ? 'This product is tracked in batches — use Receive stock to add to it.'
                  : undefined
              }
              required
            />
            <Input
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Recount after stocktake"
              hint="Recorded against the movement, so the change can be explained later"
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setQuantity(String(currentStock));
                setReason('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={invalid || busy}>
              {busy ? 'Saving…' : 'Save correction'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
