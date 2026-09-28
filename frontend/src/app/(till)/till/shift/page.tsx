'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { api, ApiError } from '@/lib/api';
import { formatAmount, formatDateTime, humanise } from '@/lib/format';
import { toast } from '@/store/toast';
import { useAuth } from '@/store/auth';

interface CurrentShift {
  open: boolean;
  shift: {
    id: string;
    shiftNumber: string;
    openingCash: string;
    expectedCash: string;
    openedAt: string;
    totals: {
      sales: string;
      refunds: string;
      transactionCount: number;
      byMethod: Record<string, string>;
    };
  } | null;
}

/**
 * The cashier's own shift — not the back-office shift report.
 *
 * Everything here concerns the drawer in front of them: what they started
 * with, what has gone through the till, and what should be in it now.
 */
export default function TillShiftPage() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);

  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [varianceReason, setVarianceReason] = useState('');
  const [reasonRequired, setReasonRequired] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['shift-current'],
    queryFn: () => api.get<CurrentShift>('/shifts/current'),
    refetchInterval: 30_000,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['shift-current'] });

  const openShift = useMutation({
    mutationFn: () =>
      api.post('/shifts/open', { openingCash: Number.parseFloat(openingCash || '0').toFixed(2) }),
    onSuccess: () => {
      toast.success('Shift opened.', 'You can start selling.');
      setOpenModal(false);
      setOpeningCash('');
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not open the shift.'),
  });

  const closeShift = useMutation({
    mutationFn: () =>
      api.post(`/shifts/${data?.shift?.id}/close`, {
        closingCash: Number.parseFloat(closingCash || '0').toFixed(2),
        ...(varianceReason ? { varianceReason } : {}),
      }),
    onSuccess: () => {
      toast.success('Shift closed.');
      setCloseModal(false);
      setClosingCash('');
      setVarianceReason('');
      setReasonRequired(false);
      refresh();
    },
    onError: (error) => {
      // The server owns the variance threshold; the form reacts to its
      // verdict rather than duplicating the rule.
      if (error instanceof ApiError && error.code === 'VARIANCE_REASON_REQUIRED') {
        setReasonRequired(true);
        toast.warning('A reason is required for this variance.', error.message);
        return;
      }
      toast.error(error instanceof ApiError ? error.message : 'Could not close the shift.');
    },
  });

  if (isLoading) return <LoadingState label="Loading your shift" />;

  const shift = data?.shift;
  const expected = shift ? Number.parseFloat(shift.expectedCash) : 0;
  const counted = Number.parseFloat(closingCash || '0');
  const variance = closingCash === '' ? null : counted - expected;

  return (
    <>
      <PageHeader
        title="My Shift"
        description={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()}
        actions={
          data?.open ? (
            <Button variant="danger" onClick={() => setCloseModal(true)}>
              Close shift
            </Button>
          ) : (
            <Button onClick={() => setOpenModal(true)}>Open shift</Button>
          )
        }
      />

      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        {data?.open && shift ? (
          <>
            <Card>
              <CardHeader
                title={`Shift ${shift.shiftNumber}`}
                subtitle={`Opened ${formatDateTime(shift.openedAt)}`}
                action={
                  <Badge tone="success" dot>
                    Open
                  </Badge>
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Opening cash" value={formatAmount(shift.openingCash)} />
                <StatCard label="Sales" value={formatAmount(shift.totals.sales)} tone="brand" />
                <StatCard label="Transactions" value={shift.totals.transactionCount} />
                <StatCard
                  label="Expected in drawer"
                  value={formatAmount(shift.expectedCash)}
                  sublabel="Cash only"
                />
              </div>
            </Card>

            {Object.keys(shift.totals.byMethod).length > 0 && (
              <Card>
                <CardHeader title="Taken this shift" subtitle="By payment method" />
                <ul className="space-y-2">
                  {Object.entries(shift.totals.byMethod).map(([method, amount]) => (
                    <li key={method} className="flex items-baseline justify-between text-sm">
                      <span className="text-ink-muted">{humanise(method)}</span>
                      <span className="font-semibold tabular text-ink">
                        {formatAmount(amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <EmptyState
              title="No shift open"
              description="Count the cash in your drawer and open a shift before you start selling."
              action={<Button onClick={() => setOpenModal(true)}>Open shift</Button>}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              }
            />
          </Card>
        )}
      </div>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Open shift"
        description="Count the cash in the drawer before you start."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpenModal(false)}>
              Cancel
            </Button>
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
        description="Count the drawer and enter what is actually there."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseModal(false)}>
              Cancel
            </Button>
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

          {(reasonRequired || (variance !== null && variance !== 0)) && (
            <Input
              label="Reason for the variance"
              value={varianceReason}
              onChange={(e) => setVarianceReason(e.target.value)}
              placeholder="e.g. Cash drop to safe"
              required={reasonRequired}
              error={
                reasonRequired && !varianceReason
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
