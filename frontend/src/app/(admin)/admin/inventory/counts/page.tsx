'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { PAGE_SIZE } from '@/hooks/useClientPagination';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { useAuth } from '@/store/auth';

interface CountRow {
  id: string;
  countNumber: string;
  status: 'IN_PROGRESS' | 'APPROVED' | 'CANCELLED';
  note: string | null;
  itemCount: number;
  startedBy: string;
  startedAt: string;
  completedBy: string | null;
  completedAt: string | null;
}

const TONE = {
  IN_PROGRESS: 'info',
  APPROVED: 'success',
  CANCELLED: 'neutral',
} as const;

export default function StockCountsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = useAuth((s) => s.can('stockcount.manage'));
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-counts', page],
    queryFn: () =>
      api.get<{ data: CountRow[]; meta: { page: number; pages: number; total: number } }>(
        `/stock-counts?page=${page}&pageSize=${PAGE_SIZE}`,
      ),
  });

  const start = useMutation({
    mutationFn: () => api.post<{ id: string }>('/stock-counts', {}),
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      router.push(`/admin/inventory/counts/${count.id}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : 'The stock count could not be started.',
      ),
  });

  return (
    <>
      <PageHeader
        title="Stock counts"
        description="Physical counts. Stock only changes when a count is approved."
        actions={
          canManage && (
            <Button onClick={() => start.mutate()} loading={start.isPending}>
              New stock count
            </Button>
          )
        }
      />

      <div className="p-4 sm:p-6">
        <Card padded={false}>
          <DataTable<CountRow>
            loading={isLoading}
            rows={data?.data ?? []}
            onRowClick={(row) => router.push(`/admin/inventory/counts/${row.id}`)}
            emptyTitle="No stock counts yet"
            emptyDescription="A count records what is physically on the shelf, then adjusts stock once you approve it."
            emptyAction={
              canManage && (
                <Button onClick={() => start.mutate()} loading={start.isPending}>
                  Start the first count
                </Button>
              )
            }
            mobileRow={(c) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-ink">{c.countNumber}</p>
                  <p className="text-xs text-ink-subtle">{formatDateTime(c.startedAt)}</p>
                </div>
                <Badge tone={TONE[c.status]}>{c.status.replace('_', ' ').toLowerCase()}</Badge>
              </div>
            )}
            columns={[
              {
                key: 'countNumber',
                header: 'Count',
                render: (c) => <span className="font-mono text-xs font-medium">{c.countNumber}</span>,
              },
              { key: 'startedAt', header: 'Started', render: (c) => formatDateTime(c.startedAt) },
              { key: 'startedBy', header: 'By', render: (c) => c.startedBy, hideOnMobile: true },
              { key: 'itemCount', header: 'Products', align: 'right', render: (c) => c.itemCount },
              {
                key: 'completedAt',
                header: 'Approved',
                render: (c) =>
                  c.completedAt ? `${formatDateTime(c.completedAt)} · ${c.completedBy}` : '—',
                hideOnMobile: true,
              },
              {
                key: 'status',
                header: 'Status',
                render: (c) => (
                  <Badge tone={TONE[c.status]} dot={c.status === 'IN_PROGRESS'}>
                    {c.status.replace('_', ' ').toLowerCase()}
                  </Badge>
                ),
              },
            ]}
          />
          <Pagination
            page={page}
            pages={data?.meta.pages ?? 0}
            total={data?.meta.total ?? 0}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </Card>
      </div>
    </>
  );
}
