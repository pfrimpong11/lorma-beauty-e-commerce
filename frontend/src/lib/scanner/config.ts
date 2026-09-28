import { getMeta, setMeta } from '../db';
import type { ScannerConfig } from './types';

/**
 * Defaults for a Newland FR20 in USB HID-KBW mode.
 *
 * Starting points, not gospel: the FR20's prefix, suffix and terminator
 * are configurable by scanning programming barcodes from Newland's
 * manual, and a unit may arrive already configured. The scanner settings
 * panel exists so an operator can match the app to the device without a
 * rebuild — see docs/hardware/newland-fr20.md.
 */
export const FR20_DEFAULTS: ScannerConfig = {
  minLength: 4,
  maxKeyIntervalMs: 40,
  // Zero: a repeat scan of the same product must increment quantity (§16).
  sameCodeCooldownMs: 0,
  prefix: '',
  suffix: '',
  terminators: ['Enter', 'Tab'],
  idleCompleteMs: 90,
  sound: true,
};

const STORAGE_KEY = 'scannerConfig';

export async function loadScannerConfig(): Promise<ScannerConfig> {
  try {
    const stored = await getMeta<Partial<ScannerConfig>>(STORAGE_KEY);
    // Merged rather than replaced, so a config saved before an option
    // existed still yields a complete object.
    return { ...FR20_DEFAULTS, ...(stored ?? {}) };
  } catch {
    return { ...FR20_DEFAULTS };
  }
}

export async function saveScannerConfig(config: ScannerConfig): Promise<void> {
  await setMeta(STORAGE_KEY, config);
}
