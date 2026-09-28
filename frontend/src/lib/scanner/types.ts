/**
 * Barcode/QR scanner input.
 *
 * Target hardware: Newland FR20 2D desktop scanner, in USB HID-KBW
 * (keyboard emulation) mode. The scanner types the decoded value and
 * sends ENTER as the terminator; nothing here talks to USB directly.
 *
 * The scanner is only another way to select a product. It resolves a
 * barcode to a product and hands it to the existing cart — it owns no
 * pricing, stock or cart logic of its own.
 */

/**
 * Transport seam. Only the keyboard wedge exists today; the boundary is
 * here so a different input source could be added later without touching
 * the lookup or cart path (§21).
 */
export type ScannerTransport = 'keyboard';

export interface ScanEvent {
  /**
   * Identifies one physical scan. Two processings of the same burst carry
   * the same id, which is how duplicate EVENT handling is suppressed
   * without ever blocking a legitimate repeat scan (§16).
   */
  id: string;
  /** The barcode, as a string. Leading zeros are preserved (§2). */
  code: string;
  /** Exactly what arrived, before trimming — shown in diagnostics. */
  raw: string;
  transport: ScannerTransport;
  at: number;
  /** How long the burst took; distinguishes a scan from typing. */
  durationMs: number;
}

export interface ScannerConfig {
  /** Shorter reads are treated as stray keystrokes, not barcodes. */
  minLength: number;

  /**
   * Largest gap between characters still considered machine input.
   * The FR20 delivers well under 10ms/char; 40ms leaves headroom for a
   * loaded browser without admitting human typing (~120ms+).
   */
  maxKeyIntervalMs: number;

  /**
   * Optional cooldown before the SAME barcode is accepted again.
   *
   * Zero by default, because scanning one item five times must add five
   * (§16, §17). Raise it only if an auto-sense scanner re-reads a product
   * left sitting on the plate — though the better fix for that is the
   * same-barcode delay on the device itself.
   */
  sameCodeCooldownMs: number;

  /** Stripped from the start of a read, if the scanner sends one. */
  prefix: string;
  /** Stripped from the end of a read. */
  suffix: string;

  /** Keys that end a read. The FR20's suffix is configurable. */
  terminators: Array<'Enter' | 'Tab'>;

  /**
   * Completion timeout for a scanner configured with NO suffix. Without
   * it, a terminator-less read would sit in the buffer forever.
   */
  idleCompleteMs: number;

  /** Short confirmation tone on an accepted scan. */
  sound: boolean;
}

export type ScanListener = (event: ScanEvent) => void;
