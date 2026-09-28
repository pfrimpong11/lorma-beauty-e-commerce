'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { api, ApiError } from '@/lib/api';
import { useScanner } from '@/hooks/useScanner';
import type { ScanEvent } from '@/lib/scanner/types';
import { toast } from '@/store/toast';
import { cn } from '@/lib/cn';

export interface ProductBarcode {
  id: string;
  barcode: string;
  isPrimary: boolean;
  isActive: boolean;
  note: string | null;
}

/**
 * The barcodes attached to a product.
 *
 * A product can carry several: a supplier reprints the code between
 * production runs, a multipack has its own, and serialized goods carry
 * one per physical unit. Price stays on the product — a barcode only
 * answers "which product is this?".
 */
export function BarcodeManager({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['product-barcodes', productId],
    queryFn: () => api.get<{ data: ProductBarcode[] }>(`/products/${productId}/barcodes`),
  });

  const add = useCallback(
    async (barcode: string) => {
      const code = barcode.trim();
      if (!code) return;

      setBusy(true);
      try {
        await api.post(`/products/${productId}/barcodes`, { barcode: code });
        setValue('');
        await refetch();
        void queryClient.invalidateQueries({ queryKey: ['products'] });
        toast.success(`${code} added.`);
      } catch (error) {
        // The API names the owning product on a clash, which is what the
        // admin actually needs — they usually mis-scanned a neighbour.
        toast.error(
          error instanceof ApiError ? error.message : 'That barcode could not be added.',
        );
      } finally {
        setBusy(false);
      }
    },
    [productId, refetch, queryClient],
  );

  // Scanning straight into the form: no button to press, no field to click.
  useScanner(
    useCallback((event: ScanEvent) => void add(event.code), [add]),
  );

  const mutate = async (id: string, body: Record<string, boolean>, label: string) => {
    setBusy(true);
    try {
      await api.patch(`/products/${productId}/barcodes/${id}`, body);
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const barcodes = data?.data ?? [];

  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-ink">Barcodes</p>
          <p className="text-xs text-ink-subtle">
            Scan or type. All of them resolve to this product at its price.
          </p>
        </div>
        {barcodes.length > 0 && (
          <Badge tone="neutral">{barcodes.filter((b) => b.isActive).length} active</Badge>
        )}
      </div>

      <div className="flex gap-2 border-b border-line p-3">
        <Input
          data-barcode-input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void add(value);
            }
          }}
          placeholder="Scan a barcode, or type it and press Enter"
          aria-label="Add a barcode"
          className="font-mono"
          disabled={busy}
        />
        <Button
          variant="secondary"
          onClick={() => void add(value)}
          disabled={busy || !value.trim()}
        >
          Add
        </Button>
      </div>

      {isLoading ? (
        <p className="px-3 py-4 text-sm text-ink-subtle">Loading…</p>
      ) : barcodes.length === 0 ? (
        <p className="px-3 py-4 text-sm text-ink-subtle">
          No barcodes yet. The first one you add becomes the primary.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {barcodes.map((b) => (
            <li
              key={b.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-2 px-3 py-2.5',
                !b.isActive && 'opacity-55',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-sm text-ink">{b.barcode}</span>
                {b.isPrimary && <Badge tone="brand">Primary</Badge>}
                {!b.isActive && <Badge tone="neutral">Retired</Badge>}
              </span>

              <span className="flex shrink-0 gap-1.5">
                {b.isActive && !b.isPrimary && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="border border-line"
                    disabled={busy}
                    onClick={() => void mutate(b.id, { isPrimary: true }, 'Primary barcode changed.')}
                  >
                    Make primary
                  </Button>
                )}
                {b.isActive ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="border border-line"
                    disabled={busy}
                    onClick={() => void mutate(b.id, { isActive: false }, 'Barcode retired.')}
                  >
                    Retire
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="border border-line"
                    disabled={busy}
                    onClick={() => void mutate(b.id, { isActive: true }, 'Barcode restored.')}
                  >
                    Restore
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
