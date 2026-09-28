'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/States';
import { api, ApiError } from '@/lib/api';
import { useScanner } from '@/hooks/useScanner';
import type { ScanEvent } from '@/lib/scanner/types';
import { formatAmount } from '@/lib/format';
import { toast } from '@/store/toast';
import { UnknownBarcode } from '@/features/inventory/UnknownBarcode';
import { ProductForm } from '@/features/products/ProductForm';

interface Line {
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  quantity: number;
  tracksExpiry: boolean;
  serialized: boolean;
  batchNumber: string;
  expiryDate: string;
  unitCost: string;
  /** Serial codes already scanned, so one unit is not received twice. */
  scanned: string[];
}

/**
 * Receive a delivery by scanning it in.
 *
 * Nothing touches stock until Confirm: the whole receipt posts as one
 * transaction, so a delivery is never half recorded because the
 * connection dropped mid-way.
 */
export default function ReceiveStockPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [lines, setLines] = useState<Line[]>([]);
  const [reason, setReason] = useState('');
  const [manual, setManual] = useState('');
  const [unknown, setUnknown] = useState<string | null>(null);
  const [createWith, setCreateWith] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleBarcode = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;

    try {
      const result = await api.get<{
        found: boolean;
        matchedBarcode?: string;
        product?: {
          id: string; name: string; sku: string;
          tracksExpiry: boolean; costPrice: string; barcodeMode?: string;
        };
      }>(`/products/barcode/${encodeURIComponent(code)}`);

      if (!result.found || !result.product) {
        setUnknown(code);
        return;
      }

      const p = result.product;
      const serialized = p.barcodeMode === 'SERIALIZED';

      setLines((current) => {
        const existing = current.find((l) => l.productId === p.id);

        if (!existing) {
          toast.success(`${p.name} added.`, 'Counted: 1');
          return [
            ...current,
            {
              productId: p.id, name: p.name, sku: p.sku, barcode: code,
              quantity: 1, tracksExpiry: p.tracksExpiry, serialized,
              batchNumber: '', expiryDate: '', unitCost: p.costPrice,
              scanned: [code],
            },
          ];
        }

        // One serialized code is one physical unit, so receiving it twice
        // in the same delivery is a mis-scan.
        if (serialized && existing.scanned.includes(code)) {
          toast.warning('Already scanned into this delivery.', code);
          return current;
        }

        const quantity = existing.quantity + 1;
        toast.success(`${p.name}`, `Counted: ${quantity}`);
        return current.map((l) =>
          l.productId === p.id
            ? { ...l, quantity, scanned: [...l.scanned, code] }
            : l,
        );
      });
    } catch {
      toast.error('Could not look that barcode up.');
    }
  }, []);

  useScanner(useCallback((event: ScanEvent) => void handleBarcode(event.code), [handleBarcode]));

  const update = (productId: string, patch: Partial<Line>) =>
    setLines((c) => c.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));

  const units = lines.reduce((sum, l) => sum + l.quantity, 0);
  const value = lines.reduce((sum, l) => sum + Number(l.unitCost || 0) * l.quantity, 0);
  const missingBatch = lines.filter((l) => l.tracksExpiry && (!l.batchNumber || !l.expiryDate));
  const canConfirm = lines.length > 0 && reason.trim().length >= 3 && missingBatch.length === 0;

  const confirm = async () => {
    setSubmitting(true);
    try {
      const result = await api.post<{ units: number; lines: unknown[] }>('/inventory/receive', {
        reason: reason.trim(),
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          ...(l.tracksExpiry ? { batchNumber: l.batchNumber, expiryDate: l.expiryDate } : {}),
          ...(l.unitCost ? { unitCost: Number(l.unitCost).toFixed(2) } : {}),
        })),
      });

      for (const key of ['inventory', 'products', 'dashboard', 'expiry']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(`${result.units} unit(s) received.`);
      setLines([]);
      setReason('');
      router.push('/admin/inventory');
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'The delivery could not be recorded.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Receive stock"
        description="Scan the delivery in. Nothing changes until you confirm."
        actions={
          lines.length > 0 && (
            <Button variant="ghost" className="border border-line" onClick={() => setLines([])}>
              Clear
            </Button>
          )
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Products" value={lines.length} />
          <StatCard label="Units" value={units} tone="brand" />
          <StatCard label="Value at cost" value={formatAmount(value.toFixed(2))} />
        </div>

        <Card padded={false}>
          <div className="flex gap-2 border-b border-line p-3">
            <Input
              data-barcode-input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleBarcode(manual);
                  setManual('');
                }
              }}
              placeholder="Scan a barcode, or type it and press Enter"
              aria-label="Scan a barcode"
              className="font-mono"
              autoFocus
            />
          </div>

          {lines.length === 0 ? (
            <EmptyState
              title="Nothing scanned yet"
              description="Point the scanner at the delivery. Each scan adds a unit."
            />
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.productId} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {l.name}
                        {l.serialized && <Badge tone="info">serialized</Badge>}
                      </p>
                      <p className="font-mono text-xs text-ink-subtle">
                        {l.sku} · {l.barcode}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center rounded-lg border border-line">
                      <button
                        onClick={() =>
                          l.quantity > 1
                            ? update(l.productId, { quantity: l.quantity - 1 })
                            : setLines((c) => c.filter((x) => x.productId !== l.productId))
                        }
                        aria-label="One fewer"
                        className="tap px-3 py-1.5 text-ink-muted hover:bg-surface-sunken"
                      >
                        −
                      </button>
                      <span className="w-12 border-x border-line py-1.5 text-center text-sm tabular text-ink">
                        {l.quantity}
                      </span>
                      <button
                        onClick={() => update(l.productId, { quantity: l.quantity + 1 })}
                        aria-label="One more"
                        className="tap px-3 py-1.5 text-ink-muted hover:bg-surface-sunken"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {l.tracksExpiry && (
                      <>
                        <Input
                          label="Batch number"
                          value={l.batchNumber}
                          onChange={(e) => update(l.productId, { batchNumber: e.target.value })}
                          error={!l.batchNumber ? 'Required' : undefined}
                          required
                        />
                        <Input
                          label="Expiry date"
                          type="date"
                          value={l.expiryDate}
                          onChange={(e) => update(l.productId, { expiryDate: e.target.value })}
                          error={!l.expiryDate ? 'Required' : undefined}
                          required
                        />
                      </>
                    )}
                    <Input
                      label="Unit cost"
                      type="number"
                      step="0.01"
                      min={0}
                      value={l.unitCost}
                      onChange={(e) => update(l.productId, { unitCost: e.target.value })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {lines.length > 0 && (
          <Card>
            <Input
              label="Reference"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Delivery from supplier, invoice INV-8842"
              hint="Recorded against every movement this delivery creates"
              required
            />
            {missingBatch.length > 0 && (
              <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                {missingBatch.length} batch-tracked product(s) still need a batch number and
                expiry date.
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button size="lg" onClick={confirm} loading={submitting} disabled={!canConfirm}>
                Confirm receipt · {units} unit{units === 1 ? '' : 's'}
              </Button>
            </div>
          </Card>
        )}
      </div>

      <UnknownBarcode
        barcode={unknown}
        onClose={() => setUnknown(null)}
        onCreate={(code) => {
          setUnknown(null);
          setCreateWith(code);
        }}
      />

      <ProductForm
        open={createWith !== null}
        editing={null}
        initialBarcode={createWith ?? undefined}
        onClose={() => setCreateWith(null)}
      />
    </>
  );
}
