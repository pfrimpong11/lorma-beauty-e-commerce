import { loadScannerConfig, saveScannerConfig } from './config';
import { KeyboardWedge } from './keyboard';
import type { ScanEvent, ScanListener, ScannerConfig } from './types';

/**
 * Owns the scanner input and fans scans out to subscribers.
 *
 * A single instance, because the scanner is a single physical device:
 * two competing keyboard listeners would each see the same burst and add
 * the product twice.
 *
 * This layer deliberately knows nothing about products, prices, stock or
 * the cart. It turns keystrokes into a barcode string and hands it on;
 * everything after that is the POS's existing flow.
 */
class ScannerManager {
  private config: ScannerConfig | null = null;
  private keyboard: KeyboardWedge | null = null;
  private readonly listeners = new Set<ScanListener>();

  /** Ids of scans already dispatched, for event-level deduplication. */
  private readonly seen = new Set<string>();
  private lastCode: string | null = null;
  private lastCodeAt = 0;
  private scanCount = 0;
  private lastScanAt: number | null = null;
  private started = false;

  async start(): Promise<void> {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    this.config = await loadScannerConfig();
    this.keyboard = new KeyboardWedge(this.config, this.handleScan);
    this.keyboard.start();
  }

  stop(): void {
    this.keyboard?.stop();
    this.keyboard = null;
    this.started = false;
  }

  private handleScan = (event: ScanEvent): void => {
    const config = this.config;
    if (!config) return;

    // §16 — guard against the SAME event being processed twice (a stray
    // second listener, a re-render, Enter handled in two places). Keyed
    // on the burst, so scanning one product five times still adds five.
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    if (this.seen.size > 50) {
      // Bounded: only recent ids can plausibly be re-delivered.
      this.seen.delete(this.seen.values().next().value as string);
    }

    // Optional, off by default. Only for an auto-sense unit that re-reads
    // a product left on the plate; the device's own same-barcode delay is
    // the better place to solve that.
    if (
      config.sameCodeCooldownMs > 0 &&
      event.code === this.lastCode &&
      event.at - this.lastCodeAt < config.sameCodeCooldownMs
    ) {
      return;
    }

    this.lastCode = event.code;
    this.lastCodeAt = event.at;
    this.lastScanAt = event.at;
    this.scanCount += 1;

    if (config.sound) beep();

    for (const listener of this.listeners) listener(event);
  };

  onScan(listener: ScanListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConfig(): ScannerConfig | null {
    return this.config;
  }

  async updateConfig(config: ScannerConfig): Promise<void> {
    this.config = config;
    await saveScannerConfig(config);
    this.keyboard?.updateConfig(config);
  }

  stats(): { scanCount: number; lastScanAt: number | null } {
    return { scanCount: this.scanCount, lastScanAt: this.lastScanAt };
  }

  /**
   * Feed a code as though it had been scanned (§26).
   *
   * Lets the flow be exercised — and tested — without the physical FR20.
   */
  simulate(code: string): void {
    const trimmed = code.trim();
    if (!trimmed) return;
    this.handleScan({
      id: `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      code: trimmed,
      raw: code,
      transport: 'keyboard',
      at: Date.now(),
      durationMs: 0,
    });
  }
}

export const scanner = new ScannerManager();

let audioContext: AudioContext | null = null;

/**
 * Short confirmation tone.
 *
 * The FR20 has its own beeper, but it fires on a successful *read* — a
 * barcode missing from the catalogue still beeps at the device. This
 * signals what actually happened at the till.
 */
function beep(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    audioContext ??= new Ctor();
    if (audioContext.state === 'suspended') void audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'square';
    oscillator.frequency.value = 2100;
    gain.gain.setValueAtTime(0.05, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.06);

    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.06);
  } catch {
    // Audio is a nicety; never let it interrupt a sale.
  }
}
