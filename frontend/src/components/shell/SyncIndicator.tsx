'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { queueCounts, getMeta } from '@/lib/db';
import { isSyncing, runFullSync } from '@/lib/sync';
import { useConnection } from '@/hooks/useOnline';
import { getConfig } from '@/lib/runtime-config';
import { toast } from '@/store/toast';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { Icon } from './Icon';

type State = 'online' | 'offline' | 'syncing' | 'attention';

/**
 * Connectivity and sync status, always visible (§23).
 *
 * The wording is deliberately concrete — "3 transactions waiting to sync"
 * rather than a bare icon — because a cashier must be able to tell at a
 * glance whether their sales have actually left the device.
 */
export function SyncIndicator() {
  const { apiUrl } = getConfig();
  const { online, reason, status } = useConnection(`${apiUrl}/health/live`);

  const [pending, setPending] = useState(0);
  const [attention, setAttention] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const counts = await queueCounts();
      setPending(counts.PENDING + counts.SYNCING);
      setAttention(counts.CONFLICT + counts.REJECTED);
      setLastSync((await getMeta<string>('lastSyncAt')) ?? null);
      setSyncing(isSyncing());
    } catch {
      // IndexedDB can be unavailable in private browsing; the indicator
      // degrades rather than breaking the shell.
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);

  // Reconnecting is the moment to drain the queue (§24 step 1).
  useEffect(() => {
    if (!online || pending === 0) return;
    let cancelled = false;

    const drain = async () => {
      setSyncing(true);
      try {
        const report = await runFullSync();
        if (cancelled) return;
        if (report.accepted > 0) {
          toast.success(
            `${report.accepted} transaction${report.accepted === 1 ? '' : 's'} synchronized.`,
          );
        }
        if (report.conflict + report.rejected > 0) {
          toast.warning(
            `${report.conflict + report.rejected} transaction(s) require attention.`,
            'Open the Sync Center to resolve them.',
          );
        }
      } catch {
        if (!cancelled) toast.error('Unable to complete synchronization.');
      } finally {
        if (!cancelled) {
          setSyncing(false);
          void refresh();
        }
      }
    };

    const timer = setTimeout(drain, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [online, pending]);

  const state: State = syncing
    ? 'syncing'
    : !online
      ? 'offline'
      : attention > 0
        ? 'attention'
        : 'online';

  const COPY: Record<State, { label: string; tone: string }> = {
    online:
      pending > 0
        ? { label: `${pending} waiting to sync`, tone: 'text-info border-info/30 bg-info/10' }
        : { label: 'All data synchronized', tone: 'text-success border-success/30 bg-success/10' },
    offline: {
      // A server that answers with an error is not a connection problem, and
      // telling a cashier to check the wifi would send them after the wrong
      // thing entirely.
      label:
        reason === 'server-error'
          ? pending > 0
            ? `Server error${status ? ` (${status})` : ''} — ${pending} waiting to sync`
            : `Server error${status ? ` (${status})` : ''}`
          : pending > 0
            ? `Offline — ${pending} waiting to sync`
            : 'Offline mode',
      tone: 'text-warning border-warning/30 bg-warning/10',
    },
    syncing: {
      label: `Syncing ${pending || ''}`.trim() + (pending ? ' transactions…' : '…'),
      tone: 'text-info border-info/30 bg-info/10',
    },
    attention: {
      label: `${attention} require attention`,
      tone: 'text-danger border-danger/30 bg-danger/10',
    },
  };

  const copy = COPY[state];

  return (
    <button
      onClick={async () => {
        if (!online) {
          toast.info(
          reason === 'server-error' ? 'The server is reachable but returning errors.' : 'Still offline.',
          reason === 'server-error'
            ? 'This is a problem on the server, not with your connection. Sales are still saved on this device.'
            : 'Sales are saved on this device and will sync automatically.',
        );
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
      }}
      title={`Last sync: ${formatRelative(lastSync)}`}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        copy.tone,
      )}
    >
      {/* Shape and text carry the state, not colour alone */}
      <motion.span
        animate={state === 'syncing' ? { rotate: 360 } : { rotate: 0 }}
        transition={
          state === 'syncing'
            ? { repeat: Infinity, duration: 1.1, ease: 'linear' }
            : { duration: 0.2 }
        }
        className="flex"
      >
        {state === 'offline' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4-2.6m8.5 2.6a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 5-3.2m10.8 1.3A15 15 0 0 1 22 8.8M12 20h.01" />
          </svg>
        ) : (
          <Icon name="sync" size={14} />
        )}
      </motion.span>
      <span className="hidden sm:inline">{copy.label}</span>
    </button>
  );
}
