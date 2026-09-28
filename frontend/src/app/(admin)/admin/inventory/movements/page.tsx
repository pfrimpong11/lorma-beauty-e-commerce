'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { formatDateTime } from '@/lib/format';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { cn } from '@/lib/cn';

interface MovementRow {
  id: string;
  product: string;
  sku: string;
  type: string;
  quantity: number;
  previousQty: number;
  newQty: number;
  reason: string;
  batch: string | null;
  user: string;
  createdAt: string;
}

const TYPES = [
  { value: '', label: 'All movements' },
  { value: 'STOCK_IN', label: 'Stock received' },
  { value: 'SALE', label: 'Sales' },
  { value: 'RETURN', label: 'Returns' },
  { value: 'ADJUSTMENT', label: 'Adjustments' },
  { value: 'STOCK_COUNT', label: 'Stock counts' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'OPENING_BALANCE', label: 'Opening balance' },
];

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral'> = {
  STOCK_IN: 'success',
  OPENING_BALANCE: 'neutral',
  SALE: 'brand',
  RETURN: 'info',
  ADJUSTMENT: 'warning',
  STOCK_COUNT: 'warning',
  DAMAGED: 'danger',
  EXPIRED: 'danger',
};

/**
 * Every stock movement, with what it was and what it became.
 *
 * This is the ledger the whole inventory model rests on: no quantity
 * changes anywhere in the application without a row appearing here,
 * carrying a reason and the person responsible.
 */
export default function MovementsPage() {
  const [type, setType] = useState('');
  const { rows, meta, isLoading, page, setPage } = usePagedQuery<MovementRow>(
    'movements',
    '/inventory/movements',
    { type: type || undefined },
  );

  return (
    <>
      <PageHeader
        title="Inventory movements"
        description="Every change to stock, and why it happened"
        actions={
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by movement type"
            className="w-52"
            options={TYPES}
          />
        }
      />

      <div className="p-4 sm:p-6">
        <Card padded={false}>
          <DataTable<MovementRow>
            loading={isLoading}
            rows={rows}
            emptyTitle="No movements"
            emptyDescription="Stock changes appear here as they happen."
            mobileRow={(m) => (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{m.product}</span>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular',
                      m.quantity < 0 ? 'text-danger' : 'text-success',
                    )}
                  >
                    {m.quantity > 0 ? '+' : ''}
                    {m.quantity}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {formatDateTime(m.createdAt)} · {m.reason}
                </p>
              </div>
            )}
            columns={[
              {
                key: 'createdAt',
                header: 'When',
                width: '150px',
                render: (m) => (
                  <span className="whitespace-nowrap text-xs text-ink-subtle">
                    {formatDateTime(m.createdAt)}
                  </span>
                ),
              },
              {
                key: 'product',
                header: 'Product',
                render: (m) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{m.product}</p>
                    <p className="font-mono text-xs text-ink-subtle">{m.sku}</p>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Type',
                render: (m) => (
                  <Badge tone={TONE[m.type] ?? 'neutral'}>
                    {m.type.replace(/_/g, ' ').toLowerCase()}
                  </Badge>
                ),
              },
              {
                key: 'quantity',
                header: 'Change',
                align: 'right',
                render: (m) => (
                  <span className={cn('font-semibold', m.quantity < 0 ? 'text-danger' : 'text-success')}>
                    {m.quantity > 0 ? '+' : ''}
                    {m.quantity}
                  </span>
                ),
              },
              {
                key: 'balance',
                header: 'Stock',
                align: 'right',
                /*
                  Stacked rather than written across.
                  "55 → 54" is two numbers, an arrow and two spaces, which a
                  narrow column breaks wherever it runs out of room — often
                  between the arrow and the figure it points at, leaving
                  rows of two different heights down the table. Reading down
                  cannot wrap, so every row is the same height and the
                  figures line up as a column of their own.
                */
                render: (m) => (
                  <span className="inline-flex flex-col items-end leading-tight tabular">
                    {/*
                      Hidden from assistive tech as a pair, because read out
                      one after the other the two figures are just "55 54"
                      with nothing to say which way round they go. The
                      sentence below carries the meaning instead.
                    */}
                    <span aria-hidden className="text-[11px] text-ink-subtle">
                      {m.previousQty}
                    </span>
                    <span aria-hidden className="font-medium text-ink">
                      <span className="mr-0.5 text-[10px] text-ink-subtle">↓</span>
                      {m.newQty}
                    </span>
                    <span className="sr-only">
                      from {m.previousQty} to {m.newQty}
                    </span>
                  </span>
                ),
              },
              { key: 'reason', header: 'Reason', render: (m) => m.reason, hideOnMobile: true },
              { key: 'user', header: 'By', render: (m) => m.user, hideOnMobile: true },
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
