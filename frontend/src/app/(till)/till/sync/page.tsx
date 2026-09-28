'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/States';
import { getMeta, getQueue, type QueuedSale } from '@/lib/db';
import { runFullSync } from '@/lib/sync';
import { useOnline } from '@/hooks/useOnline';
import { getConfig } from '@/lib/runtime-config';
import { formatAmount, formatDateTime, formatRelative } from '@/lib/format';
import { toast } from '@/store/toast';

/**
 * Sync Center (§23).
 *
 * Shows exactly what is still on this device and why, so a cashier is never
 * left guessing whether a sale reached the server.
 */
export default function SyncPage() {
  const { apiUrl } = getConfig();
  const online = useOnline(`${apiUrl}/health/live`);

  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setQueue(await getQueue());
      setLastSync((await getMeta<string>('lastSyncAt')) ?? null);
    } catch {
      // IndexedDB unavailable (private browsing) — show an empty queue
      // rather than an error page.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const pending = queue.filter((q) => q.status === 'PENDING' || q.status === 'SYNCING');
  const attention = queue.filter((q) => q.status === 'CONFLICT' || q.status === 'REJECTED');

  const sync = async () => {
    if (!online) {
      toast.info('Still offline.', 'Sales stay safely on this device until you reconnect.');
      return;
    }
    setSyncing(true);
    try {
      const report = await runFullSync();
      toast.success(
        report.accepted > 0
          ? `${report.accepted} transaction(s) synchronized.`
          : 'Everything is up to date.',
      );
    } catch {
      toast.error('Unable to complete synchronization.');
    } finally {
      setSyncing(false);
      void refresh();
    }
  };

  return (
    <>
      <PageHeader
        title="Sync Center"
        description="Transactions saved on this device"
        actions={
          <Button onClick={sync} loading={syncing} disabled={!online && pending.length === 0}>
            Sync now
          </Button>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Connection"
            value={online ? 'Online' : 'Offline'}
            tone={online ? 'success' : 'warning'}
            loading={!loaded}
          />
          <StatCard
            label="Waiting to sync"
            value={pending.length}
            tone={pending.length > 0 ? 'warning' : 'neutral'}
            loading={!loaded}
          />
          <StatCard
            label="Need attention"
            value={attention.length}
            tone={attention.length > 0 ? 'danger' : 'neutral'}
            loading={!loaded}
          />
          <StatCard label="Last sync" value={formatRelative(lastSync)} loading={!loaded} />
        </div>

        {!online && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
            <p className="text-sm font-medium text-warning">
              Offline mode — {pending.length} transaction{pending.length === 1 ? '' : 's'} waiting to sync
            </p>
            <p className="mt-0.5 text-xs text-warning/85">
              Keep selling. Everything is saved on this device and will sync automatically when the
              connection returns.
            </p>
          </div>
        )}

        <Card padded={false}>
          <div className="border-b border-line px-4 py-3">
            <CardHeader
              title="Queued transactions"
              subtitle="Sales completed on this device that have not yet reached the server"
            />
          </div>

          {queue.length === 0 ? (
            <EmptyState
              title="Nothing queued"
              description="Every sale made on this device has been synchronized."
            />
          ) : (
            <ul className="divide-y divide-line">
              {queue.map((entry) => (
                <li key={entry.clientUuid} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tabular text-ink">
                        {formatAmount(entry.receiptPreview.total)}
                      </span>
                      <span className="text-xs text-ink-subtle">
                        {entry.receiptPreview.itemCount} item(s) · {entry.receiptPreview.customerName}
                      </span>
                      {entry.status === 'PENDING' && <Badge tone="info">Pending sync</Badge>}
                      {entry.status === 'SYNCING' && <Badge tone="info" dot>Syncing</Badge>}
                      {entry.status === 'CONFLICT' && <Badge tone="warning">Conflict</Badge>}
                      {entry.status === 'REJECTED' && <Badge tone="danger">Rejected</Badge>}
                    </div>

                    <p className="mt-1 text-xs text-ink-subtle">
                      Sold {formatDateTime(entry.clientTime)} · device {entry.deviceId}
                      {entry.attempts > 0 && ` · ${entry.attempts} attempt(s)`}
                    </p>

                    <ul className="mt-1.5 space-y-0.5">
                      {entry.receiptPreview.lines.map((line, i) => (
                        <li key={i} className="text-xs text-ink-muted">
                          {line.quantity} × {line.name}
                          <span className="ml-1.5 tabular">{formatAmount(line.lineTotal)}</span>
                        </li>
                      ))}
                    </ul>

                    {entry.lastError && (
                      <p className="mt-1.5 rounded border border-danger/25 bg-danger/10 px-2 py-1 text-xs text-danger">
                        {entry.lastError}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {attention.length > 0 && (
          <div className="rounded-xl border border-line bg-surface-raised p-4">
            <p className="text-sm font-medium text-ink">About conflicts</p>
            <p className="mt-1 text-sm text-ink-muted">
              These sales happened in the shop but could not be applied — usually because the stock
              had already been sold from another till while this device was offline. They are kept
              here and recorded on the server; an administrator can resolve them from the audit
              trail. Nothing has been lost.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
