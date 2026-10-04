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
    raisingBatched;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/inventory/adjust', {
        productId,
        newQuantity: next,
        /*
         * Every stock movement carries a reason, because a figure that
         * moves with nothing explaining it makes later counts impossible to
         * trust. Asking for one here interrupted a quick correction, so it
         * is written automatically — the ledger still says where the change
         * came from, and the audit log already records who made it.
         */
        reason: `Edited from the product form (${currentStock} → ${next})`,
      });
      for (const key of ['products', 'inventory', 'dashboard', 'expiry']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(`${productName} is now ${next} in stock.`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The stock could not be updated.');
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
              : 'Edit it here if the shelf says otherwise.'}
          </p>
        </div>
        {!open && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Edit
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4 rounded-lg bg-surface-sunken p-3">
          <div>
            <Input
              label="New quantity"
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
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setQuantity(String(currentStock));
              }}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={invalid || busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
