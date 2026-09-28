'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { usePagedQuery } from '@/hooks/usePagedQuery';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  summary: string;
  user: string;
  ipAddress: string | null;
  createdAt: string;
}

const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  SALE_COMPLETED: 'success',
  SHIFT_OPENED: 'info',
  SHIFT_CLOSED: 'info',
  RETURN_PROCESSED: 'warning',
  PRODUCT_PRICE_CHANGED: 'warning',
  INVENTORY_ADJUSTED: 'warning',
  STOCK_WRITTEN_OFF: 'warning',
  LOGIN_FAILED: 'danger',
  USER_DEACTIVATED: 'danger',
  SYNC_CONFLICT: 'danger',
  SYNC_REJECTED: 'danger',
};

export default function AuditPage() {
  const [action, setAction] = useState('');
  const { rows, meta, isLoading, page, setPage } = usePagedQuery<AuditRow>(
    'audit',
    '/audit',
    { action: action || undefined },
  );

  const { data: actions } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: () => api.get<{ data: string[] }>('/audit/actions'),
  });

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Every significant action, with who did it and when"
        actions={
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by action"
            placeholder="All actions"
            className="w-56"
            options={(actions?.data ?? []).map((a) => ({
              value: a,
              label: a.replace(/_/g, ' ').toLowerCase(),
            }))}
          />
        }
      />

      <div className="p-4 sm:p-6">
        <Card padded={false}>
          <DataTable<AuditRow>
            loading={isLoading}
            rows={rows}
            emptyTitle="No audit entries"
            mobileRow={(a) => (
              <div>
                <p className="text-sm text-ink">{a.summary}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">{formatDateTime(a.createdAt)}</p>
              </div>
            )}
            columns={[
              {
                key: 'createdAt',
                header: 'When',
                width: '150px',
                render: (a) => (
                  <span className="whitespace-nowrap text-xs text-ink-subtle">
                    {formatDateTime(a.createdAt)}
                  </span>
                ),
              },
              {
                key: 'action',
                header: 'Action',
                render: (a) => (
                  <Badge tone={TONES[a.action] ?? 'neutral'}>
                    {a.action.replace(/_/g, ' ').toLowerCase()}
                  </Badge>
                ),
              },
              { key: 'summary', header: 'Detail', render: (a) => a.summary },
              { key: 'user', header: 'User', render: (a) => a.user, hideOnMobile: true },
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
