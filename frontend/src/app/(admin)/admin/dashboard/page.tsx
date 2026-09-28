'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatAmount, humanise } from '@/lib/format';

interface Dashboard {
  today: { totalSales: string; transactions: number; itemsSold: number; averageTransactionValue: string };
  inventory: { totalProducts: number; lowStock: number; outOfStock: number; expiringSoon: number };
  sales: {
    today: string; week: string; month: string;
    weekTransactions: number; monthTransactions: number;
    byPaymentMethod: Array<{ method: string; amount: string; count: number }>;
  };
  productPerformance: {
    topSelling: Array<{ productId: string; name: string; quantitySold: number; revenue: string }>;
    slowMoving: Array<{ productId: string; name: string; quantitySold: number }>;
  };
}

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingState label="Loading dashboard" />;
  if (isError || !data) {
    return <ErrorState description="The dashboard could not be loaded." onRetry={() => void refetch()} />;
  }

  const maxPayment = Math.max(
    ...data.sales.byPaymentMethod.map((m) => Number.parseFloat(m.amount)),
    1,
  );

  return (
    <>
      <PageHeader title="Dashboard" description="Today at a glance" />

      <div className="space-y-5 p-4 sm:p-6">
        <section>
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Today&apos;s overview
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total sales" value={formatAmount(data.today.totalSales)} tone="brand" />
            <StatCard label="Transactions" value={data.today.transactions} />
            <StatCard label="Items sold" value={data.today.itemsSold} />
            <StatCard
              label="Average sale"
              value={formatAmount(data.today.averageTransactionValue)}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Inventory
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total products" value={data.inventory.totalProducts} />
            <StatCard
              label="Low stock"
              value={data.inventory.lowStock}
              tone={data.inventory.lowStock > 0 ? 'warning' : 'neutral'}
              sublabel={data.inventory.lowStock > 0 ? 'Needs reordering' : 'All healthy'}
            />
            <StatCard
              label="Out of stock"
              value={data.inventory.outOfStock}
              tone={data.inventory.outOfStock > 0 ? 'danger' : 'neutral'}
            />
            <StatCard
              label="Expiring soon"
              value={data.inventory.expiringSoon}
              tone={data.inventory.expiringSoon > 0 ? 'warning' : 'neutral'}
              sublabel="Within the warning window"
            />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Sales" subtitle="Rolling periods" />
            <dl className="space-y-2.5">
              {[
                ['Today', data.sales.today, data.today.transactions],
                ['This week', data.sales.week, data.sales.weekTransactions],
                ['This month', data.sales.month, data.sales.monthTransactions],
              ].map(([label, amount, count]) => (
                <div key={String(label)} className="flex items-baseline justify-between">
                  <dt className="text-sm text-ink-muted">
                    {label}
                    <span className="ml-1.5 text-xs text-ink-subtle">({count} sales)</span>
                  </dt>
                  <dd className="text-sm font-semibold tabular text-ink">
                    {formatAmount(String(amount))}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Payment methods" subtitle="Today" />
            {data.sales.byPaymentMethod.length === 0 ? (
              <p className="py-4 text-sm text-ink-subtle">No payments taken yet today.</p>
            ) : (
              <ul className="space-y-3">
                {data.sales.byPaymentMethod.map((m) => (
                  <li key={m.method}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="text-ink-muted">{humanise(m.method)}</span>
                      <span className="font-medium tabular text-ink">{formatAmount(m.amount)}</span>
                    </div>
                    {/* A simple proportional bar reads faster than a chart here */}
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(Number.parseFloat(m.amount) / maxPayment) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Top selling" subtitle="This month" />
            {data.productPerformance.topSelling.length === 0 ? (
              <p className="py-4 text-sm text-ink-subtle">No sales this month yet.</p>
            ) : (
              <ol className="space-y-2.5">
                {data.productPerformance.topSelling.map((p, i) => (
                  <li key={p.productId} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                    <Badge tone="neutral">{p.quantitySold} sold</Badge>
                    <span className="w-20 text-right text-sm font-medium tabular text-ink">
                      {formatAmount(p.revenue)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Slow moving" subtitle="This month" />
            {data.productPerformance.slowMoving.length === 0 ? (
              <p className="py-4 text-sm text-ink-subtle">Not enough data yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.productPerformance.slowMoving.map((p) => (
                  <li key={p.productId} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                    <Badge tone="warning">{p.quantitySold} sold</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
