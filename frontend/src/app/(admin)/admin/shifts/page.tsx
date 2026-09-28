'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { api, ApiError } from '@/lib/api';
import { formatAmount, formatDateTime, humanise } from '@/lib/format';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { toast } from '@/store/toast';

interface CurrentShift {
  open: boolean;
  shift: {
    id: string;
    shiftNumber: string;
    openingCash: string;
    expectedCash: string;
    openedAt: string;
    totals: { sales: string; refunds: string; transactionCount: number; byMethod: Record<string, string> };
  } | null;
}

interface ShiftRow {
  id: string;
  shiftNumber: string;
  cashier: string;
  status: string;
  openingCash: string;
  expectedCash: string | null;
  closingCash: string | null;
  variance: string | null;
  varianceReason: string | null;
  openedAt: string;
  closedAt: string | null;
}

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [varianceReason, setVarianceReason] = useState('');
  const [varianceRequired, setVarianceRequired] = useState(false);

  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ['shift-current'],
    queryFn: () => api.get<CurrentShift>('/shifts/current'),
  });

  const list = usePagedQuery<ShiftRow>('shifts', '/shifts');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['shift-current'] });
    void queryClient.invalidateQueries({ queryKey: ['shifts'] });
  };

  const openShift = useMutation({
    mutationFn: () => api.post('/shifts/open', { openingCash: Number.parseFloat(openingCash || '0').toFixed(2) }),
    onSuccess: () => {
      toast.success('Shift opened.');
      setOpenModal(false);
      setOpeningCash('');
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not open the shift.'),
  });

  const closeShift = useMutation({
    mutationFn: () =>
      api.post(`/shifts/${current?.shift?.id}/close`, {
        closingCash: Number.parseFloat(closingCash || '0').toFixed(2),
        ...(varianceReason ? { varianceReason } : {}),
      }),
    onSuccess: () => {
      toast.success('Shift closed.');
      setCloseModal(false);
      setClosingCash('');
      setVarianceReason('');
      setVarianceRequired(false);
      refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VARIANCE_REASON_REQUIRED') {
        // The server decides the threshold; the form reacts to its verdict
        // rather than duplicating the rule.
        setVarianceRequired(true);
        toast.warning('A reason is required for this variance.', error.message);
        return;
      }
      toast.error(error instanceof ApiError ? error.message : 'Could not close the shift.');
    },
  });

  const shift = current?.shift;
  const expected = shift ? Number.parseFloat(shift.expectedCash) : 0;
  const counted = Number.parseFloat(closingCash || '0');
  const variance = closingCash === '' ? null : counted - expected;

  return (
    <>
      <PageHeader
        title="Shifts"
        description="Open, track and reconcile the cash drawer"
        actions={
          current?.open ? (
            <Button variant="danger" onClick={() => setCloseModal(true)}>
              Close shift
            </Button>
          ) : (
            <Button onClick={() => setOpenModal(true)}>Open shift</Button>
          )
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {loadingCurrent ? null : current?.open && shift ? (
          <Card>
            <CardHeader
              title={`Shift ${shift.shiftNumber} is open`}
              subtitle={`Opened ${formatDateTime(shift.openedAt)}`}
              action={<Badge tone="success" dot>Open</Badge>}
            />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Opening cash" value={formatAmount(shift.openingCash)} />
              <StatCard label="Sales" value={formatAmount(shift.totals.sales)} tone="brand" />
              <StatCard label="Transactions" value={shift.totals.transactionCount} />
              <StatCard label="Expected cash" value={formatAmount(shift.expectedCash)} />
            </div>
            {Object.keys(shift.totals.byMethod).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(shift.totals.byMethod).map(([method, amount]) => (
                  <Badge key={method} tone="neutral">
                    {humanise(method)}: {formatAmount(amount)}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card className="text-center">
            <p className="text-sm font-medium text-ink">No shift is open</p>
            <p className="mt-1 text-sm text-ink-subtle">
              Open a shift with your starting cash float before selling.
            </p>
            <Button className="mt-4" onClick={() => setOpenModal(true)}>
              Open shift
            </Button>
          </Card>
        )}

        <Card padded={false}>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Shift history</h2>
          </div>
          <DataTable<ShiftRow>
            loading={list.isLoading}
            rows={list.rows}
            emptyTitle="No shifts yet"
            mobileRow={(s) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-ink">{s.shiftNumber}</p>
                  <p className="text-xs text-ink-subtle">{s.cashier}</p>
                </div>
                <Badge tone={s.status === 'OPEN' ? 'success' : 'neutral'}>{s.status.toLowerCase()}</Badge>
              </div>
            )}
            columns={[
              {
                key: 'shiftNumber',
                header: 'Shift',
                render: (s) => <span className="font-mono text-xs font-medium">{s.shiftNumber}</span>,
              },
              { key: 'cashier', header: 'Cashier', render: (s) => s.cashier },
              { key: 'openedAt', header: 'Opened', render: (s) => formatDateTime(s.openedAt), hideOnMobile: true },
              {
                key: 'openingCash',
                header: 'Opening',
                align: 'right',
                render: (s) => formatAmount(s.openingCash),
                hideOnMobile: true,
              },
              {
                key: 'expectedCash',
                header: 'Expected',
                align: 'right',
                render: (s) => formatAmount(s.expectedCash),
                hideOnMobile: true,
              },
              {
                key: 'closingCash',
                header: 'Counted',
                align: 'right',
                render: (s) => formatAmount(s.closingCash),
              },
              {
                key: 'variance',
                header: 'Variance',
                align: 'right',
                render: (s) => {
                  if (s.variance === null) return '—';
                  const value = Number.parseFloat(s.variance);
                  return (
                    <span
                      title={s.varianceReason ?? undefined}
                      className={
                        value === 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-warning'
                      }
                    >
                      {value > 0 ? '+' : ''}
                      {formatAmount(s.variance)}
                    </span>
                  );
                },
              },
              {
                key: 'status',
                header: 'Status',
                render: (s) => (
                  <Badge tone={s.status === 'OPEN' ? 'success' : 'neutral'} dot={s.status === 'OPEN'}>
                    {s.status.toLowerCase()}
                  </Badge>
                ),
              },
            ]}
          />
          <Pagination
            page={list.page}
            pages={list.meta.pages}
            total={list.meta.total}
            pageSize={list.meta.pageSize}
            onPageChange={list.setPage}
          />
        </Card>
      </div>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Open shift"
        description="Count the cash in the drawer before you start."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpenModal(false)}>Cancel</Button>
            <Button onClick={() => openShift.mutate()} loading={openShift.isPending}>
              Open shift
            </Button>
          </>
        }
      >
        <Input
          label="Opening cash"
          type="number"
          step="0.01"
          min={0}
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          placeholder="500.00"
          data-autofocus
          required
        />
      </Modal>

      <Modal
        open={closeModal}
        onClose={() => setCloseModal(false)}
        title="Close shift"
        description="Count the drawer and enter the actual amount."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseModal(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => closeShift.mutate()}
              loading={closeShift.isPending}
              disabled={closingCash === ''}
            >
              Close shift
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-sunken p-3">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Expected cash</span>
              <span className="font-semibold tabular text-ink">
                {formatAmount(shift?.expectedCash)}
              </span>
            </div>
          </div>

          <Input
            label="Actual cash counted"
            type="number"
            step="0.01"
            min={0}
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            placeholder="0.00"
            data-autofocus
            required
          />

          {variance !== null && (
            <div
              className={`rounded-lg border px-3 py-2.5 text-sm ${
                variance === 0
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-warning/30 bg-warning/10 text-warning'
              }`}
            >
              <div className="flex justify-between font-medium">
                <span>Variance</span>
                <span className="tabular">
                  {variance > 0 ? '+' : ''}
                  {formatAmount(variance.toFixed(2))}
                </span>
              </div>
            </div>
          )}

          {(varianceRequired || (variance !== null && Math.abs(variance) > 0)) && (
            <Input
              label="Reason for the variance"
              value={varianceReason}
              onChange={(e) => setVarianceReason(e.target.value)}
              placeholder="e.g. Cash drop to safe"
              required={varianceRequired}
              error={
                varianceRequired && !varianceReason
                  ? 'A reason is required for this variance.'
                  : undefined
              }
            />
          )}
        </div>
      </Modal>
    </>
  );
}
