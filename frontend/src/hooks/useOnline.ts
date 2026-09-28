'use client';

import { useEffect, useState } from 'react';

/**
 * Connectivity state.
 *
 * `navigator.onLine` only reports whether the device has *a* network, not
 * whether our API is reachable — a till on shop wifi with a dead uplink
 * still reads "online". The periodic health probe closes that gap.
 */
/**
 * Why the till is not reachable, which is not the same question as whether
 * it is. A misconfigured server answers every probe with 503, and reporting
 * that as "offline" sent two separate investigations after a network fault
 * that did not exist. `online` keeps its meaning — false means queue the
 * sale locally — and the reason exists to be shown to whoever has to fix it.
 */
export type ConnectionReason = 'ok' | 'no-network' | 'server-error' | 'unreachable';

export interface Connection {
  online: boolean;
  reason: ConnectionReason;
  /** Status the probe came back with, when it came back at all. */
  status: number | null;
}

export function useConnection(probeUrl?: string, intervalMs = 20_000): Connection {
  const [state, setState] = useState<Connection>({ online: true, reason: 'ok', status: null });

  useEffect(() => {
    const setFromNavigator = () =>
      setState((prev) =>
        navigator.onLine
          ? prev.reason === 'no-network'
            ? { online: true, reason: 'ok', status: null }
            : prev
          : { online: false, reason: 'no-network', status: null },
      );
    setFromNavigator();

    window.addEventListener('online', setFromNavigator);
    window.addEventListener('offline', setFromNavigator);

    let cancelled = false;
    const probe = async () => {
      if (!navigator.onLine) {
        if (!cancelled) setState({ online: false, reason: 'no-network', status: null });
        return;
      }
      if (!probeUrl) return;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(probeUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (cancelled) return;
        setState({
          online: response.ok,
          // The server answered, so the network is fine and something on
          // this side is broken — a very different fix from "check wifi".
          reason: response.ok ? 'ok' : 'server-error',
          status: response.status,
        });
      } catch {
        if (!cancelled) setState({ online: false, reason: 'unreachable', status: null });
      }
    };

    void probe();
    const timer = setInterval(probe, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', setFromNavigator);
      window.removeEventListener('offline', setFromNavigator);
    };
  }, [probeUrl, intervalMs]);

  return state;
}

/** The plain question, for callers that only need to know whether to queue. */
export function useOnline(probeUrl?: string, intervalMs = 20_000): boolean {
  return useConnection(probeUrl, intervalMs).online;
}
