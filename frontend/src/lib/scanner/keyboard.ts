import type { ScanEvent, ScanListener, ScannerConfig } from './types';

/**
 * USB HID keyboard-wedge transport — the FR20's factory default.
 *
 * The scanner is indistinguishable from a keyboard at the OS level, so
 * the only thing separating a scan from typing is timing: the FR20 emits
 * a whole code in single-digit milliseconds per character, a person
 * cannot. Everything here follows from that.
 *
 * Two awkward cases the naive version got wrong:
 *
 *   - A read can land while the cashier is typing in a search box. We
 *     buffer either way, but only swallow the keystrokes once the burst
 *     is clearly machine-speed, so ordinary typing is never eaten.
 *   - A scanner configured with no suffix never sends Enter. Those reads
 *     complete on an idle timer instead.
 */
export class KeyboardWedge {
  private buffer = '';
  private burstStartedAt = 0;
  private lastKeyAt = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private attached = false;
  private readonly swallowed: KeyboardEvent[] = [];

  constructor(
    private config: ScannerConfig,
    private readonly onScan: ScanListener,
  ) {}

  updateConfig(config: ScannerConfig): void {
    this.config = config;
  }

  start(): void {
    if (this.attached || typeof window === 'undefined') return;
    // Capture phase: a scan must be intercepted before a focused input
    // consumes it, otherwise the barcode ends up typed into the field.
    window.addEventListener('keydown', this.handleKeyDown, true);
    this.attached = true;
  }

  stop(): void {
    if (!this.attached) return;
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.clearIdleTimer();
    this.buffer = '';
    this.attached = false;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;

    // A field explicitly marked as the barcode box handles its own input.
    if (target?.dataset?.barcodeInput !== undefined) return;

    // Modifier combinations are shortcuts, never barcode data.
    if (event.ctrlKey || event.metaKey || event.altKey) {
      this.reset();
      return;
    }

    const now = performance.now();
    const gap = now - this.lastKeyAt;

    if (this.isTerminator(event.key)) {
      // Only claim the terminator if what preceded it actually looked
      // like a scan — otherwise Enter must still submit the form.
      if (this.looksLikeScan()) {
        event.preventDefault();
        event.stopPropagation();
        this.complete();
      } else {
        this.reset();
      }
      return;
    }

    // Printable characters only. event.key already carries the shifted
    // value, so no manual shift handling is needed.
    if (event.key.length !== 1) return;

    // Too slow to be machine input: start a fresh burst.
    if (gap > this.config.maxKeyIntervalMs) {
      this.reset();
      this.burstStartedAt = now;
    }

    this.buffer += event.key;
    this.lastKeyAt = now;

    // Once the burst is unambiguously machine-speed, stop the characters
    // reaching the page. Everything before that point is left alone, so a
    // false positive cannot silently eat a cashier's typing.
    if (this.looksLikeScan()) {
      event.preventDefault();
      event.stopPropagation();
      this.swallowed.push(event);
    }

    this.armIdleTimer();
  };

  /**
   * A burst counts as a scan once it is long enough AND was delivered
   * faster than a person could type it.
   */
  private looksLikeScan(): boolean {
    if (this.buffer.length < this.config.minLength) return false;
    const elapsed = this.lastKeyAt - this.burstStartedAt;
    const perChar = elapsed / Math.max(1, this.buffer.length - 1);
    return perChar <= this.config.maxKeyIntervalMs;
  }

  /** Completes reads from a scanner configured without a suffix. */
  private armIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.looksLikeScan()) this.complete();
      else this.reset();
    }, this.config.idleCompleteMs);
  }

  private complete(): void {
    this.clearIdleTimer();

    const raw = this.buffer;
    const startedAt = this.burstStartedAt;
    const durationMs = Math.round(this.lastKeyAt - startedAt);
    this.reset();

    // Trim whitespace only; the value stays a string so leading zeros
    // survive ("0012345678905" must not become 12345678905) — §2.
    const code = stripAffixes(raw, this.config);
    if (code.length < this.config.minLength) return;

    this.onScan({
      // Derived from the burst, not the clock: two processings of the
      // same physical scan share an id, two separate scans never do.
      id: `kbd-${startedAt.toFixed(3)}-${raw}`,
      code,
      raw,
      transport: 'keyboard',
      at: Date.now(),
      durationMs,
    } satisfies ScanEvent);
  }

  private isTerminator(key: string): boolean {
    return (this.config.terminators as string[]).includes(key);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private reset(): void {
    this.clearIdleTimer();
    this.buffer = '';
    this.burstStartedAt = 0;
    // Cleared too, so the next character always opens a fresh burst.
    // Leaving it set meant a scan arriving within maxKeyIntervalMs of the
    // previous one inherited a burst start of 0, measured as impossibly
    // slow, and was dropped — losing the second of two rapid scans.
    this.lastKeyAt = 0;
    this.swallowed.length = 0;
  }
}

/**
 * Remove a configured prefix/suffix and any stray control characters.
 *
 * The FR20 can be programmed to wrap every read; rather than insisting the
 * device be reconfigured, the app strips what it is told to expect.
 */
export function stripAffixes(raw: string, config: ScannerConfig): string {
  let value = raw.replace(/[\r\n\t]+$/g, '');

  if (config.prefix && value.startsWith(config.prefix)) {
    value = value.slice(config.prefix.length);
  }
  if (config.suffix && value.endsWith(config.suffix)) {
    value = value.slice(0, -config.suffix.length);
  }

  return value.trim();
}
