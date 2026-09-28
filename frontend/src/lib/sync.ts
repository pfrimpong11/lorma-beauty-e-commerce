import { api, ApiError } from './api';
import {
  cacheCatalogue,
  getMeta,
  getQueue,
  removeFromQueue,
  setMeta,
  updateQueueEntry,
  type QueuedSale,
} from './db';

/**
 * The synchronisation engine (§24).
 *
 * Contract this upholds:
 *   - a completed offline sale is never discarded (§51.9)
 *   - retries reuse the original idempotency key, so they cannot duplicate
 *     a sale (§51.10, §51.11)
 *   - a failure on one entry does not block the rest of the queue
 */

export type SyncState = 'idle' | 'syncing' | 'synced' | 'failed' | 'offline';

export interface SyncReport {
  accepted: number;
  duplicate: number;
  conflict: number;
  rejected: number;
  remaining: number;
}

interface PushResult {
  results: Array<{
    idempotencyKey: string;
    clientUuid: string;
    status: 'ACCEPTED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';
    receiptNumber?: string;
    message?: string;
  }>;
  summary: { accepted: number; duplicate: number; conflict: number; rejected: number };
}

/** Sales are pushed in bounded batches so one huge backlog cannot time out. */
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 8;

let syncing = false;

export function isSyncing(): boolean {
  return syncing;
}

/**
 * Drain the local queue to the server.
 *
 * Guarded against re-entry: the online event, the interval timer and a
 * manual "Sync now" can all fire at once, and running two drains
 * concurrently would send the same entries twice.
 */
export async function pushQueue(): Promise<SyncReport> {
  if (syncing) {
    return { accepted: 0, duplicate: 0, conflict: 0, rejected: 0, remaining: 0 };
  }
  syncing = true;

  const report: SyncReport = { accepted: 0, duplicate: 0, conflict: 0, rejected: 0, remaining: 0 };

  try {
    const pending = (await getQueue('PENDING')).filter((e) => e.attempts < MAX_ATTEMPTS);

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map((e) => updateQueueEntry(e.clientUuid, { status: 'SYNCING' })));

      try {
        const result = await api.post<PushResult>('/sync/push', {
          sales: batch.map((entry) => ({
            idempotencyKey: entry.idempotencyKey,
            clientUuid: entry.clientUuid,
            deviceId: entry.deviceId,
            clientSequence: entry.clientSequence,
            clientTime: entry.clientTime,
            sale: {
              ...entry.sale,
              clientUuid: entry.clientUuid,
              deviceId: entry.deviceId,
              clientSequence: entry.clientSequence,
            },
          })),
        });

        for (const outcome of result.results) {
          if (outcome.status === 'ACCEPTED' || outcome.status === 'DUPLICATE') {
            // Safely applied server-side; the local copy is no longer needed.
            await removeFromQueue(outcome.clientUuid);
          } else {
            // Kept locally with its reason, for the Sync Center to surface.
            await updateQueueEntry(outcome.clientUuid, {
              status: outcome.status,
              lastError: outcome.message ?? 'Could not be applied.',
            });
          }
        }

        report.accepted += result.summary.accepted;
        report.duplicate += result.summary.duplicate;
        report.conflict += result.summary.conflict;
        report.rejected += result.summary.rejected;
      } catch (error) {
        // Transport failure: put the batch back so it retries later. The
        // sale is not lost, and the idempotency key is unchanged.
        const message =
          error instanceof ApiError ? error.message : 'Synchronisation could not complete.';
        await Promise.all(
          batch.map((e) =>
            updateQueueEntry(e.clientUuid, {
              status: 'PENDING',
              attempts: e.attempts + 1,
              lastError: message,
            }),
          ),
        );
        break;
      }
    }

    await setMeta('lastSyncAt', new Date().toISOString());
  } finally {
    syncing = false;
  }

  report.remaining = (await getQueue('PENDING')).length;
  return report;
}

/** Fetch catalogue changes since the last successful pull (§26). */
export async function pullCatalogue(force = false): Promise<{ products: number }> {
  const since = force ? undefined : await getMeta<string>('lastPullAt');
  const query = since ? `?since=${encodeURIComponent(since)}` : '';

  const data = await api.get<{
    serverTime: string;
    products: Parameters<typeof cacheCatalogue>[0]['products'];
    categories: Parameters<typeof cacheCatalogue>[0]['categories'];
    customers: Parameters<typeof cacheCatalogue>[0]['customers'];
    counts: { products: number };
  }>(`/sync/pull${query}`);

  await cacheCatalogue({
    products: data.products,
    categories: data.categories,
    customers: data.customers,
    serverTime: data.serverTime,
  });

  return { products: data.counts.products };
}

/** Push anything queued, then refresh the local catalogue. */
export async function runFullSync(): Promise<SyncReport> {
  const report = await pushQueue();
  try {
    await pullCatalogue();
  } catch {
    // A failed pull is not fatal — the cached catalogue still works.
  }
  return report;
}
