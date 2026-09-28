'use client';

import { useEffect, useRef, useState } from 'react';
import { scanner } from '@/lib/scanner/manager';
import type { ScanEvent } from '@/lib/scanner/types';

/**
 * Subscribe to barcode scans.
 *
 * The handler is held in a ref so a caller passing an inline arrow does
 * not resubscribe on every render — resubscribing mid-burst is one of the
 * ways the same scan gets processed twice.
 */
export function useScanner(onScan: (event: ScanEvent) => void, enabled = true): void {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    void scanner.start();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return scanner.onScan((event) => handler.current(event));
  }, [enabled]);
}

/**
 * Scan counters for the settings panel.
 *
 * Deliberately not a "scanner connected" indicator: in HID-KBW mode the
 * browser cannot tell whether a scanner is plugged in, and claiming
 * otherwise would be a lie the cashier might rely on (§20).
 */
export function useScannerStats(): { scanCount: number; lastScanAt: number | null } {
  const [stats, setStats] = useState(() => ({ scanCount: 0, lastScanAt: null as number | null }));

  useEffect(() => {
    void scanner.start();
    const timer = setInterval(() => setStats(scanner.stats()), 1000);
    return () => clearInterval(timer);
  }, []);

  return stats;
}
