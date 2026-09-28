'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import { toast } from '@/store/toast';

interface SaleForReturn {
  id: string;
  receiptNumber: string;
  total: string;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    quantityReturned: number;
    lineTotal: string;
  }>;
}

const REASONS = [
  { value: 'CUSTOMER_CHANGED_MIND', label: 'Customer changed their mind' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'WRONG_ITEM', label: 'Wrong item' },
  { value: 'ALLERGIC_REACTION', label: 'Allergic reaction' },
  { value: 'OTHER', label: 'Other' },
];

const REFUND_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'STORE_CREDIT', label: 'Store credit' },
];

/**
 * Process a return against a specific sale (§17).
 *
 * The quantity available to return is what was sold minus what has already
 * come back, so a second return against the same line cannot over-refund.
 */
export function ReturnModal({
  open,
  onClose,
  sale,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  sale: SaleForReturn;
  onDone: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('CUSTOMER_CHANGED_MIND');
  const [reasonNote, setReasonNote] = useState('');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setQuantities({});
      setReason('CUSTOMER_CHANGED_MIND');
      setReasonNote('');
      setRefundMethod('CASH');
    }
  }, [open]);

  const lines = sale.items.map((item) => ({
    ...item,
    available: item.quantity - item.quantityReturned,
    unitPrice: Number.parseFloat(item.lineTotal) / item.quantity,
  }));

  const refundTotal = lines.reduce(
    (sum, line) => sum + (quantities[line.id] ?? 0) * line.unitPrice,
    0,
  );
  const selected = Object.values(quantities).some((q) => q > 0);

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await api.post<{ returnNumber: string; refundAmount: string }>('/returns', {
        saleId: sale.id,
        items: lines
          .filter((line) => (quantities[line.id] ?? 0) > 0)
          .map((line) => ({ saleItemId: line.id, quantity: quantities[line.id] })),
        reason,
        ...(reasonNote ? { reasonNote } : {}),
        refundMethod,
      });
      toast.success(
        `Refund ${result.returnNumber} processed.`,
        `${formatAmount(result.refundAmount)} refunded.`,
      );
      onDone();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'The return could not be processed.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Return items"
      description={`Against ${sale.receiptNumber}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={submitting}
            disabled={!selected}
          >
            Refund {formatAmount(refundTotal.toFixed(2))}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-line rounded-lg border border-line">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{line.productName}</p>
                <p className="text-xs text-ink-subtle">
                  {formatAmount(line.unitPrice.toFixed(2))} each ·{' '}
                  {line.available > 0
                    ? `${line.available} of ${line.quantity} available`
                    : 'already returned'}
                </p>
              </div>

              {line.available > 0 ? (
                <div className="flex shrink-0 items-center rounded-lg border border-line">
                  <button
                    type="button"
                    onClick={() =>
                      setQuantities((q) => ({
                        ...q,
                        [line.id]: Math.max(0, (q[line.id] ?? 0) - 1),
                      }))
                    }
                    aria-label={`Return one fewer ${line.productName}`}
                    className="px-2.5 py-1.5 text-ink-muted transition-colors hover:bg-surface-sunken"
                  >
                    −
                  </button>
                  <span className="w-10 border-x border-line py-1.5 text-center text-sm tabular text-ink">
                    {quantities[line.id] ?? 0}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantities((q) => ({
                        ...q,
                        [line.id]: Math.min(line.available, (q[line.id] ?? 0) + 1),
                      }))
                    }
                    disabled={(quantities[line.id] ?? 0) >= line.available}
                    aria-label={`Return one more ${line.productName}`}
                    className="px-2.5 py-1.5 text-ink-muted transition-colors hover:bg-surface-sunken disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              ) : (
                <span className="shrink-0 text-xs text-ink-subtle">—</span>
              )}
            </li>
          ))}
        </ul>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            options={REASONS}
          />
          <Select
            label="Refund by"
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value)}
            options={REFUND_METHODS}
          />
        </div>

        <Input
          label="Note"
          value={reasonNote}
          onChange={(e) => setReasonNote(e.target.value)}
          placeholder="Anything worth recording about this return"
        />

        {(reason === 'EXPIRED' || reason === 'DAMAGED') && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Expired and damaged goods are written off rather than returned to sellable stock.
          </p>
        )}
      </div>
    </Modal>
  );
}
