'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Select } from '@/components/ui/Select';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { useClientPagination } from '@/hooks/useClientPagination';
import { api } from '@/lib/api';
import { formatAmount, formatDate } from '@/lib/format';

interface ExpiryRow {
  batchId: string;
  batchNumber: string;
  productId: string;
  product: string;
  sku: string;
  quantity: number;
  expiryDate: string;
  daysUntilExpiry: number;
  status: 'EXPIRED' | 'EXPIRING_SOON';
  valueAtCost: string;
}

export default function ExpiryPage() {
  const [days, setDays] = useState('30');

  const { data, isLoading } = useQuery({
    queryKey: ['expiry', days],
    queryFn: () =>
      api.get<{ data: ExpiryRow[]; meta: { windowDays: number; expired: number; expiringSoon: number } }>(
        `/inventory/expiring?days=${days}`,
      ),
  });

  const rows = data?.data ?? [];
  const { page, setPage, pages, pageSize, total, pageRows } = useClientPagination(rows);

  return (
    <>
      <PageHeader
        title="Expiry"
        description="Batches approaching or past their expiry date"
        actions={
          <Select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label="Warning window"
            className="w-40"
            options={[
              { value: '7', label: 'Within 7 days' },
              { value: '30', label: 'Within 30 days' },
              { value: '60', label: 'Within 60 days' },
              { value: '90', label: 'Within 90 days' },
            ]}
          />
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="Expired"
            value={data?.meta.expired ?? 0}
            tone="danger"
            sublabel="Cannot be sold"
            loading={isLoading}
          />
          <StatCard
            label="Expiring soon"
            value={data?.meta.expiringSoon ?? 0}
            tone="warning"
            sublabel={`Within ${days} days`}
            loading={isLoading}
          />
          <StatCard
            label="Value at risk"
            value={formatAmount(
              rows.reduce((sum, r) => sum + Number.parseFloat(r.valueAtCost), 0).toFixed(2),
            )}
            loading={isLoading}
          />
        </div>

        <Card padded={false}>
          <DataTable
            loading={isLoading}
            rows={pageRows.map((r) => ({ ...r, id: r.batchId }))}
            emptyTitle="Nothing expiring"
            emptyDescription={`No batches expire within ${days} days.`}
            mobileRow={(r) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{r.product}</p>
                  <p className="text-xs text-ink-subtle">
                    {r.batchNumber} · {formatDate(r.expiryDate)}
                  </p>
                </div>
                {r.status === 'EXPIRED' ? (
                  <Badge tone="danger">Expired</Badge>
                ) : (
                  <Badge tone="warning">{r.daysUntilExpiry}d</Badge>
                )}
              </div>
            )}
            columns={[
              {
                key: 'product',
                header: 'Product',
                render: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{r.product}</p>
                    <p className="font-mono text-xs text-ink-subtle">{r.sku}</p>
                  </div>
                ),
              },
              { key: 'batchNumber', header: 'Batch', render: (r) => r.batchNumber, hideOnMobile: true },
              { key: 'expiryDate', header: 'Expires', render: (r) => formatDate(r.expiryDate) },
              { key: 'quantity', header: 'Qty', align: 'right', render: (r) => r.quantity },
              {
                key: 'valueAtCost',
                header: 'Value',
                align: 'right',
                render: (r) => formatAmount(r.valueAtCost),
                hideOnMobile: true,
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) =>
                  r.status === 'EXPIRED' ? (
                    <Badge tone="danger">Expired {Math.abs(r.daysUntilExpiry)}d ago</Badge>
                  ) : (
                    <Badge tone="warning">{r.daysUntilExpiry} days left</Badge>
                  ),
              },
            ]}
          />
          <Pagination
            page={page}
            pages={pages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </Card>
      </div>
    </>
  );
}
