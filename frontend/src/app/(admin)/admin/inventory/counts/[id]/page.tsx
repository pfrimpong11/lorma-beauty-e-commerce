'use client';

import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { api, ApiError } from '@/lib/api';
import { useScanner } from '@/hooks/useScanner';
import type { ScanEvent } from '@/lib/scanner/types';
import { formatDateTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/cn';
import { UnknownBarcode } from '@/features/inventory/UnknownBarcode';
import { ProductForm } from '@/features/products/ProductForm';

interface CountItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
}

interface CountDetail {
  id: string;
  countNumber: string;
  status: 'IN_PROGRESS' | 'APPROVED' | 'CANCELLED';
  note: string | null;
  startedBy: string;
  startedAt: string;
  completedBy: string | null;
  completedAt: string | null;
  scanCount: number;
  items: CountItem[];
  totals: {
    products: number; counted: number; system: number;
    shortages: number; overages: number; matched: number;
  };
}

type ScanResult =
  | { status: 'counted'; item: CountItem; product: { name: string } }
  | { status: 'duplicate'; barcode: string; product: { name: string } }
  | { status: 'unknown'; barcode: string };

/**
 * Counting screen.
 *
 * Scanning is always live while the count is open — the scanner drives
 * everything and the admin never has to click back into a field. Nothing
 * here changes stock: the counted figures live on the count document
 * until it is approved.
 */
export default function StockCountPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = useAuth((s) => s.can('stockcount.manage'));
  const canApprove = useAuth((s) => s.can('stockcount.approve'));

  const [manual, setManual] = useState('');
  const [unknown, setUnknown] = useState<string | null>(null);
  const [createWith, setCreateWith] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState('');
  const [lastTouched, setLastTouched] = useState<string | null>(null);

  const { data: count, isLoading, refetch } = useQuery({
    queryKey: ['stock-count', id],
    queryFn: () => api.get<CountDetail>(`/stock-counts/${id}`),
  });

  const open = count?.status === 'IN_PROGRESS';

  const handleBarcode = useCallback(
    async (barcode: string) => {
      const code = barcode.trim();
      if (!code || !open) return;

      try {
        const result = await api.post<ScanResult>(`/stock-counts/${id}/scan`, { barcode: code });

        if (result.status === 'unknown') {
          setUnknown(result.barcode);
          return;
        }
        if (result.status === 'duplicate') {
          // A serialized code is one physical unit — counting it twice
          // would inflate the count.
          toast.warning('This barcode has already been counted.', result.product.name);
          return;
        }

        setLastTouched(result.item.productId);
        toast.success(`${result.product.name} counted`, `Counted: ${result.item.countedQuantity}`);
        await refetch();
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : 'That scan did not register.');
      }
    },
    [id, open, refetch],
  );

  useScanner(
    useCallback((event: ScanEvent) => void handleBarcode(event.code), [handleBarcode]),
    open,
  );

  const setQuantity = useMutation({
    mutationFn: ({ itemId, qty }: { itemId: string; qty: number }) =>
      api.patch(`/stock-counts/${id}/items/${itemId}`, { countedQuantity: qty }),
    onSuccess: () => void refetch(),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'That change did not save.'),
  });

  const approve = async () => {
    setApproving(true);
    try {
      await api.post(`/stock-counts/${id}/approve`, note.trim() ? { note: note.trim() } : {});
      for (const key of ['inventory', 'products', 'dashboard', 'stock-counts', 'expiry']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      await refetch();
      toast.success('Stock count approved.', 'Inventory now matches the count.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The count could not be approved.');
    } finally {
      setApproving(false);
    }
  };

  if (isLoading || !count) return <LoadingState label="Loading stock count" />;

  return (
    <>
      <PageHeader
        title={`Stock count ${count.countNumber}`}
        description={
          open
            ? `Started ${formatDateTime(count.startedAt)} by ${count.startedBy} · counting does not change stock`
            : `${count.status === 'APPROVED' ? 'Approved' : 'Cancelled'} ${formatDateTime(count.completedAt)} by ${count.completedBy}`
        }
        actions={
          <>
            <Button variant="ghost" className="border border-line" onClick={() => router.push('/admin/inventory/counts')}>
              All counts
            </Button>
            {open && canManage && (
              <Button variant="ghost" className="border border-line" onClick={() => setCancelling(true)}>
                Cancel count
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Products counted" value={count.totals.products} />
          <StatCard label="Units counted" value={count.totals.counted} tone="brand" />
          <StatCard
            label="Shortages"
            value={count.totals.shortages}
            tone={count.totals.shortages > 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            label="Overages"
            value={count.totals.overages}
            tone={count.totals.overages > 0 ? 'warning' : 'neutral'}
          />
        </div>

        {open ? (
          <Card padded={false}>
            <div className="border-b border-line p-3">
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
              <p className="mt-2 text-xs text-ink-subtle">
                Every scan adds one. Stock is untouched until you approve the count.
              </p>
            </div>
            {count.items.length === 0 && (
              <EmptyState
                title="Nothing counted yet"
                description="Start scanning the shelf. Products appear here as you go."
              />
            )}
          </Card>
        ) : (
          <div
            className={cn(
              'rounded-xl border px-4 py-3 text-sm',
              count.status === 'APPROVED'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-line bg-surface-sunken text-ink-muted',
            )}
          >
            {count.status === 'APPROVED'
              ? 'This count has been approved and inventory was adjusted to it. It can no longer be changed.'
              : 'This count was cancelled. Stock was not changed.'}
          </div>
        )}

        {count.items.length > 0 && (
          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-subtle">Product</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-subtle">System</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-subtle">Counted</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-subtle">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {count.items.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        'transition-colors',
                        lastTouched === item.productId && 'bg-brand-50/60',
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{item.name}</p>
                        <p className="font-mono text-xs text-ink-subtle">{item.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular text-ink-muted">
                        {item.systemQuantity}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {open && canManage ? (
                          <input
                            type="number"
                            min={0}
                            defaultValue={item.countedQuantity}
                            key={`${item.id}-${item.countedQuantity}`}
                            onBlur={(e) => {
                              const qty = Number(e.target.value);
                              if (qty !== item.countedQuantity && qty >= 0) {
                                setQuantity.mutate({ itemId: item.id, qty });
                              }
                            }}
                            aria-label={`Counted quantity for ${item.name}`}
                            className="w-20 rounded border border-line bg-surface px-2 py-1 text-right text-sm tabular text-ink"
                          />
                        ) : (
                          <span className="tabular font-medium text-ink">{item.countedQuantity}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.variance === 0 ? (
                          <Badge tone="success">match</Badge>
                        ) : (
                          <Badge tone={item.variance < 0 ? 'danger' : 'warning'}>
                            {item.variance > 0 ? '+' : ''}
                            {item.variance}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {open && canApprove && (
              <div className="space-y-3 border-t border-line p-4">
                <Input
                  label="Note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Counted by Ama, end of month"
                  hint="Recorded against every adjustment this count produces"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-ink-subtle">
                    Approving sets stock to the counted figures and writes a movement for each
                    change. It cannot be undone.
                  </p>
                  <Button size="lg" onClick={() => setApproving(true)} disabled={approving}>
                    Approve count
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={approving}
        onClose={() => setApproving(false)}
        onConfirm={approve}
        title={`Approve ${count.countNumber}?`}
        confirmLabel="Approve and adjust stock"
        message={`Stock for ${count.totals.products} product(s) will be set to the counted figures — ${count.totals.shortages} shortage(s) and ${count.totals.overages} overage(s). This cannot be undone.`}
      />

      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={async () => {
          await api.post(`/stock-counts/${id}/cancel`, {});
          await refetch();
          toast.success('Stock count cancelled.', 'Stock was not changed.');
        }}
        title={`Cancel ${count.countNumber}?`}
        tone="danger"
        confirmLabel="Cancel count"
        message="The counted figures are kept for the record, but stock will not be adjusted."
      />

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
