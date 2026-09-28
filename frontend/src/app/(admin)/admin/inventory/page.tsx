'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { formatAmount } from '@/lib/format';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { cn } from '@/lib/cn';
import Link from 'next/link';
import { useAuth } from '@/store/auth';
import {
  InventoryActions,
  type InventoryAction,
  type InventoryTarget,
} from '@/features/inventory/InventoryActions';

interface InventoryRow {
  productId: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  minStockLevel: number;
  costPrice: string;
  sellingPrice: string;
  stockValue: string;
  status: 'OK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'ok', label: 'Healthy' },
] as const;

export default function InventoryPage() {
  const canReceive = useAuth((s) => s.can('inventory.stock_in'));
  const canAdjust = useAuth((s) => s.can('inventory.adjust'));
  const canWriteOff = useAuth((s) => s.can('inventory.write_off'));
  const canAct = canReceive || canAdjust || canWriteOff;

  const [status, setStatus] = useState('');
  const [action, setAction] = useState<InventoryAction | null>(null);
  const [target, setTarget] = useState<InventoryTarget | null>(null);

  const start = (next: InventoryAction, row: InventoryRow) => {
    setTarget({
      productId: row.productId,
      name: row.name,
      sku: row.sku,
      quantity: row.quantity,
    });
    setAction(next);
  };
  const { rows, meta, isLoading, page, setPage, search, setSearch } = usePagedQuery<
    InventoryRow & { id?: string }
  >('inventory', '/inventory', { status: status || undefined });

  const totalValue = (meta as { totalStockValue?: string }).totalStockValue;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock levels and valuation"
        actions={
          <>
            {canReceive && (
              <Link href="/admin/inventory/receive">
                <Button>Receive stock</Button>
              </Link>
            )}
            <Link href="/admin/inventory/counts">
              <Button variant="secondary">Stock counts</Button>
            </Link>
          </>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Products shown" value={meta.total} loading={isLoading} />
          <StatCard
            label="Stock value at cost"
            value={totalValue ? formatAmount(totalValue) : '—'}
            tone="brand"
            loading={isLoading}
          />
          <StatCard
            label="Low stock"
            value={rows.filter((r) => r.status === 'LOW_STOCK').length}
            tone="warning"
            sublabel="on this page"
            loading={isLoading}
          />
          <StatCard
            label="Out of stock"
            value={rows.filter((r) => r.status === 'OUT_OF_STOCK').length}
            tone="danger"
            sublabel="on this page"
            loading={isLoading}
          />
        </div>

        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              aria-label="Search inventory"
              className="max-w-xs"
            />
            <div className="flex gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => {
                    setStatus(f.value);
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    status === f.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-line text-ink-muted hover:text-ink',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <DataTable
            loading={isLoading}
            rows={rows.map((r) => ({ ...r, id: r.productId }))}
            emptyTitle="Nothing matches this filter"
            mobileRow={(r) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                  <p className="font-mono text-xs text-ink-subtle">{r.sku}</p>
                </div>
                <span className="shrink-0 tabular text-sm text-ink">{r.quantity}</span>
              </div>
            )}
            columns={[
              {
                key: 'name',
                header: 'Product',
                render: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{r.name}</p>
                    <p className="font-mono text-xs text-ink-subtle">{r.sku}</p>
                  </div>
                ),
              },
              { key: 'category', header: 'Category', render: (r) => r.category, hideOnMobile: true },
              { key: 'quantity', header: 'Stock', align: 'right', render: (r) => r.quantity },
              {
                key: 'minStockLevel',
                header: 'Minimum',
                align: 'right',
                render: (r) => r.minStockLevel,
                hideOnMobile: true,
              },
              {
                key: 'stockValue',
                header: 'Value at cost',
                align: 'right',
                render: (r) => formatAmount(r.stockValue),
                hideOnMobile: true,
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) =>
                  r.status === 'OUT_OF_STOCK' ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : r.status === 'LOW_STOCK' ? (
                    <Badge tone="warning">Low stock</Badge>
                  ) : (
                    <Badge tone="success">OK</Badge>
                  ),
              },
              ...(canAct
                ? [
                    {
                      key: 'actions',
                      header: '',
                      align: 'right' as const,
                      render: (r: InventoryRow) => (
                        <span className="flex justify-end gap-1.5">
                          {canReceive && (
                            <Button size="sm" variant="secondary" onClick={() => start('receive', r)}>
                              Receive
                            </Button>
                          )}
                          {canAdjust && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="border border-line"
                              onClick={() => start('adjust', r)}
                            >
                              Adjust
                            </Button>
                          )}
                          {canWriteOff && r.quantity > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="border border-line"
                              onClick={() => start('write-off', r)}
                            >
                              Write off
                            </Button>
                          )}
                        </span>
                      ),
                    },
                  ]
                : []),
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

      <InventoryActions
        action={action}
        target={target}
        onClose={() => {
          setAction(null);
          setTarget(null);
        }}
      />
    </>
  );
}
