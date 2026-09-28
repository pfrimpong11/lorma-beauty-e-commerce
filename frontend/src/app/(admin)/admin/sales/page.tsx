'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { printReceipt } from '@/lib/printer/print';
import { formatAmount, formatDateTime } from '@/lib/format';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { Receipt, type ReceiptData } from '@/features/pos/Receipt';
import { ReceiptPrintHost } from '@/features/pos/ReceiptPrintHost';

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

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  COMPLETED: 'success',
  PARTIALLY_RETURNED: 'warning',
  RETURNED: 'warning',
  VOIDED: 'danger',
  HELD: 'neutral',
};

export default function SalesPage() {
  const { rows, meta, isLoading, page, setPage, search, setSearch } =
    usePagedQuery<SaleRow>('sales', '/sales');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['sale', selectedId],
    queryFn: () =>
      api.get<{
        receiptNumber: string; soldAt: string; subtotal: string; discountAmount: string; total: string;
        customer: { name: string } | null;
        cashier: { firstName: string; lastName: string };
        items: Array<{ productName: string; quantity: number; lineTotal: string }>;
        payments: Array<{ method: string; amount: string; amountTendered: string | null; changeGiven: string | null }>;
      }>(`/sales/${selectedId}`),
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

  return (
    <>
      <PageHeader title="Sales" description="Every completed transaction" />
      <div className="p-4 sm:p-6">
        <Card padded={false}>
          <div className="border-b border-line p-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Receipt number or customer…"
              aria-label="Search by receipt number or customer"
              wrapperClassName="max-w-xs"
            />
          </div>

          <DataTable<SaleRow>
            loading={isLoading}
            rows={rows}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyTitle="No sales yet"
            emptyDescription="Completed sales will appear here."
            mobileRow={(row) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-ink">{row.receiptNumber}</p>
                  <p className="text-xs text-ink-subtle">
                    {formatDateTime(row.soldAt)} · {row.cashier}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular text-ink">
                  {formatAmount(row.total)}
                </span>
              </div>
            )}
            columns={[
              {
                key: 'receiptNumber',
                header: 'Receipt',
                render: (r) => <span className="font-mono text-xs font-medium">{r.receiptNumber}</span>,
              },
              { key: 'soldAt', header: 'Date', render: (r) => formatDateTime(r.soldAt), hideOnMobile: true },
              { key: 'customer', header: 'Customer', render: (r) => r.customer, hideOnMobile: true },
              { key: 'cashier', header: 'Cashier', render: (r) => r.cashier, hideOnMobile: true },
              { key: 'itemCount', header: 'Items', align: 'right', render: (r) => r.itemCount },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
                      {r.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                    {r.origin === 'OFFLINE_SYNCED' && <Badge tone="info">synced</Badge>}
                  </div>
                ),
              },
              {
                key: 'total',
                header: 'Total',
                align: 'right',
                render: (r) => <span className="font-semibold">{formatAmount(r.total)}</span>,
              },
            ]}
          />

          <Pagination
            page={page}
            pages={meta.pages}
            total={meta.total}
            pageSize={meta.pageSize}
            onPageChange={setPage}
          />
        </Card>
      </div>

      <ReceiptPrintHost data={receipt} />

      <Modal
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title="Sale detail"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedId(null)}>Close</Button>
            <Button onClick={() => void printReceipt()}>Print receipt</Button>
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
    </>
  );
}
