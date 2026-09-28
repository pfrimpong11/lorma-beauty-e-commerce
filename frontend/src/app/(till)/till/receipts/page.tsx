'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { Pagination } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { formatAmount, formatDateTime } from '@/lib/format';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/cn';
import { Receipt, type ReceiptData } from '@/features/pos/Receipt';
import { ReceiptPrintHost } from '@/features/pos/ReceiptPrintHost';
import { ReturnModal } from '@/features/pos/ReturnModal';
import { printReceipt } from '@/lib/printer/print';

interface SaleRow {
  id: string;
  receiptNumber: string;
  soldAt: string;
  status: string;
  origin: string;
  total: string;
  itemCount: number;
  cashier: string;
  customer: string;
}

interface SaleDetail {
  id: string;
  receiptNumber: string;
  soldAt: string;
  status: string;
  subtotal: string;
  discountAmount: string;
  total: string;
  amountRefunded: string;
  customer: { name: string } | null;
  cashier: { firstName: string; lastName: string };
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    quantityReturned: number;
    lineTotal: string;
  }>;
  payments: Array<{
    method: string;
    amount: string;
    amountTendered: string | null;
    changeGiven: string | null;
  }>;
}

const STATUS: Record<string, { label: string; tone: 'warning' | 'danger' | 'neutral' }> = {
  PARTIALLY_RETURNED: { label: 'Part returned', tone: 'warning' },
  RETURNED: { label: 'Returned', tone: 'warning' },
  VOIDED: { label: 'Voided', tone: 'danger' },
  HELD: { label: 'Held', tone: 'neutral' },
};

/**
 * Receipt lookup at the counter.
 *
 * Cards rather than a list: a receipt is one self-contained thing a
 * cashier picks up with a finger, and the total — the value they are
 * scanning the page for — can carry real weight instead of being one more
 * column at the end of a row.
 */
export default function TillReceiptsPage() {
  const canReturn = useAuth((s) => s.can('return.create'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);

  const { rows, meta, isLoading, page, setPage, search, setSearch } = usePagedQuery<SaleRow>(
    'till-receipts',
    '/sales',
  );

  const { data: detail, refetch } = useQuery({
    queryKey: ['sale', selectedId],
    queryFn: () => api.get<SaleDetail>(`/sales/${selectedId}`),
    enabled: selectedId !== null,
  });

  const receipt: ReceiptData | null = detail
    ? {
        receiptNumber: detail.receiptNumber,
        soldAt: detail.soldAt,
        cashierName: `${detail.cashier.firstName} ${detail.cashier.lastName}`,
        customerName: detail.customer?.name ?? 'Walk-in Customer',
        items: detail.items,
        subtotal: detail.subtotal,
        discountAmount: detail.discountAmount,
        total: detail.total,
        payments: detail.payments,
      }
    : null;

  const returnable = detail?.items.some((i) => i.quantity - i.quantityReturned > 0) ?? false;

  return (
    <>
      <PageHeader title="Receipts" description="Find a sale to reprint or return" />

      <div className="space-y-4 p-4 sm:p-6">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Receipt number or customer…"
          aria-label="Search by receipt number or customer"
          wrapperClassName="max-w-md"
          leading={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          }
        />

        {isLoading ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-line bg-surface-raised p-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3.5 w-36" />
                <Skeleton className="mt-1.5 h-3 w-32" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface-raised">
            <EmptyState
              title={search ? 'No matching receipts' : 'No sales yet'}
              description={
                search
                  ? 'Try a different receipt number or customer.'
                  : 'Completed sales appear here as soon as they are rung up.'
              }
            />
          </div>
        ) : (
          <>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {rows.map((sale) => {
                const status = STATUS[sale.status];
                return (
                  <motion.button
                    key={sale.id}
                    layout
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedId(sale.id)}
                    className={cn(
                      'flex flex-col rounded-xl border border-line bg-surface-raised p-3 text-left',
                      'transition-colors hover:border-brand-300 hover:shadow-card',
                      'focus-visible:border-brand-400',
                    )}
                  >
                    {/* Receipt and total share the top line: the total keeps
                        its prominence without costing a row of its own. */}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-sm font-semibold text-ink">
                        {sale.receiptNumber}
                      </span>
                      <span className="shrink-0 text-base font-semibold tabular text-brand-700">
                        {formatAmount(sale.total)}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm text-ink">
                        {sale.customer}
                        <span className="text-ink-subtle">
                          {' · '}
                          {sale.itemCount} item{sale.itemCount === 1 ? '' : 's'}
                        </span>
                      </p>
                      {(status || sale.origin === 'OFFLINE_SYNCED') && (
                        <span className="flex shrink-0 gap-1">
                          {status && <Badge tone={status.tone}>{status.label}</Badge>}
                          {sale.origin === 'OFFLINE_SYNCED' && <Badge tone="info">Synced</Badge>}
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 truncate text-xs text-ink-subtle">
                      {formatDateTime(sale.soldAt)} · {sale.cashier}
                    </p>
                  </motion.button>
                );
              })}
            </div>

            <div className="rounded-xl border border-line bg-surface-raised">
              <Pagination
                page={page}
                pages={meta.pages}
                total={meta.total}
                pageSize={meta.pageSize}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      <ReceiptPrintHost data={receipt} />

      <Modal
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title={detail?.receiptNumber ?? 'Receipt'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedId(null)}>
              Close
            </Button>
            {canReturn && returnable && (
              <Button variant="danger" onClick={() => setReturnOpen(true)}>
                Return items
              </Button>
            )}
            <Button onClick={() => void printReceipt()}>Print</Button>
          </>
        }
      >
        {receipt ? (
          <div className="rounded-lg border border-line">
            <Receipt data={receipt} />
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-ink-subtle">Loading…</div>
        )}
      </Modal>

      {detail && (
        <ReturnModal
          open={returnOpen}
          onClose={() => setReturnOpen(false)}
          sale={detail}
          onDone={() => {
            setReturnOpen(false);
            void refetch();
          }}
        />
      )}
    </>
  );
}
