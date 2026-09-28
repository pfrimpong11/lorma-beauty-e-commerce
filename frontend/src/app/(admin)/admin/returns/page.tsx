'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { formatAmount, formatDateTime, humanise } from '@/lib/format';
import { usePagedQuery } from '@/hooks/usePagedQuery';

interface ReturnRow {
  id: string;
  returnNumber: string;
  receiptNumber: string;
  refundAmount: string;
  refundMethod: string;
  reason: string;
  itemCount: number;
  processedBy: string;
  createdAt: string;
}

export default function ReturnsPage() {
  const { rows, meta, isLoading, page, setPage } = usePagedQuery<ReturnRow>('returns', '/returns');

  return (
    <>
      <PageHeader title="Returns" description="Refunds processed against past sales" />
      <div className="p-4 sm:p-6">
        <Card padded={false}>
          <DataTable<ReturnRow>
            loading={isLoading}
            rows={rows}
            emptyTitle="No returns yet"
            emptyDescription="Returns are processed from a sale's detail view."
            mobileRow={(r) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-ink">{r.returnNumber}</p>
                  <p className="text-xs text-ink-subtle">against {r.receiptNumber}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular text-danger">
                  −{formatAmount(r.refundAmount)}
                </span>
              </div>
            )}
            columns={[
              {
                key: 'returnNumber',
                header: 'Return',
                render: (r) => <span className="font-mono text-xs font-medium">{r.returnNumber}</span>,
              },
              {
                key: 'receiptNumber',
                header: 'Original sale',
                render: (r) => <span className="font-mono text-xs">{r.receiptNumber}</span>,
              },
              {
                key: 'createdAt',
                header: 'When',
                render: (r) => formatDateTime(r.createdAt),
                hideOnMobile: true,
              },
              {
                key: 'reason',
                header: 'Reason',
                render: (r) => <Badge tone="warning">{humanise(r.reason)}</Badge>,
              },
              {
                key: 'refundMethod',
                header: 'Method',
                render: (r) => humanise(r.refundMethod),
                hideOnMobile: true,
              },
              { key: 'processedBy', header: 'By', render: (r) => r.processedBy, hideOnMobile: true },
              {
                key: 'refundAmount',
                header: 'Refund',
                align: 'right',
                render: (r) => (
                  <span className="font-semibold text-danger">−{formatAmount(r.refundAmount)}</span>
                ),
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
    </>
  );
}
