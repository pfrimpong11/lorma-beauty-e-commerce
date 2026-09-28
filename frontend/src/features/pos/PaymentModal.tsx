'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/cn';

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'OTHER', label: 'Other' },
] as const;

export interface PaymentResult {
  method: string;
  amount: string;
  amountTendered?: string;
  reference?: string;
}

export function PaymentModal({
  open,
  onClose,
  total,
  onConfirm,
  submitting,
  offline,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  onConfirm: (payment: PaymentResult) => void | Promise<void>;
  submitting: boolean;
  offline: boolean;
}) {
  const [method, setMethod] = useState<string>('CASH');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (open) {
      setMethod('CASH');
      setTendered('');
      setReference('');
    }
  }, [open]);

  const tenderedValue = Number.parseFloat(tendered || '0');
  const change = useMemo(
    () => (method === 'CASH' && tenderedValue >= total ? tenderedValue - total : 0),
    [method, tenderedValue, total],
  );

  const cashShort = method === 'CASH' && tendered !== '' && tenderedValue < total;
  /*
   * An empty cash field used to pass, so a sale could complete with no
   * record of what was handed over — which makes the change owed unknowable
   * and the shift's cash count impossible to reconcile. It is now required,
   * and must at least cover the total.
   */
  const cashMissing = method === 'CASH' && tendered.trim() === '';
  const canConfirm = !submitting && !cashMissing && !cashShort;

  const confirm = () => {
    if (!canConfirm) return;
    void onConfirm({
      method,
      amount: total.toFixed(2),
      // Always present for cash now: the field is required above.
      ...(method === 'CASH' ? { amountTendered: tenderedValue.toFixed(2) } : {}),
      ...(reference ? { reference } : {}),
    });
  };

  /** Quick-tender buttons for the notes a cashier actually handles. */
  const suggestions = useMemo(() => {
    const exact = Math.ceil(total);
    const set = new Set<number>([exact]);
    for (const note of [5, 10, 20, 50, 100, 200]) {
      const rounded = Math.ceil(total / note) * note;
      if (rounded >= total) set.add(rounded);
    }
    return [...set].sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take payment"
      description={offline ? 'Offline — this sale will be saved on this device' : undefined}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="lg" onClick={confirm} loading={submitting} disabled={!canConfirm}>
            Complete sale · {formatAmount(total.toFixed(2))}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl bg-brand-50 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Amount due</p>
          <p className="mt-1 text-3xl font-semibold tabular text-brand-800">
            {formatAmount(total.toFixed(2))}
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Payment method</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                aria-pressed={method === m.value}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                  method === m.value
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-line text-ink-muted hover:border-brand-300 hover:text-ink',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        {method === 'CASH' ? (
          <div className="space-y-3">
            <Input
              label="Cash tendered"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              placeholder={total.toFixed(2)}
              error={cashShort ? 'Tendered amount is less than the total.' : undefined}
              hint={cashMissing ? 'Required — enter what the customer handed over.' : undefined}
              required
              data-autofocus
            />
            <div className="flex flex-wrap gap-2">
              {suggestions.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setTendered(amount.toFixed(2))}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-ink"
                >
                  {formatAmount(amount.toFixed(2))}
                </button>
              ))}
            </div>
            {change > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/10 px-4 py-3">
                <span className="text-sm font-medium text-success">Change due</span>
                <span className="text-xl font-semibold tabular text-success">
                  {formatAmount(change.toFixed(2))}
                </span>
              </div>
            )}
          </div>
        ) : (
          <Input
            label="Reference"
            hint="Transaction or approval reference, if you have one"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. MM-4483021"
            data-autofocus
          />
        )}
      </div>
    </Modal>
  );
}
