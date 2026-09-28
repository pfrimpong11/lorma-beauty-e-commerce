import { getMeta, setMeta } from '../db';

/**
 * Receipt printer settings.
 *
 * Target hardware: an AnyPay thermal receipt printer attached to the
 * cashier's workstation with an OS driver installed. The browser prints
 * to it like any other printer, so nothing here talks to USB and the
 * backend is not involved — the same reasoning as the scanner.
 *
 * Stored per device, because two tills in the same shop can have
 * different printers.
 */

export type PaperWidth = '80mm' | '58mm';

export interface PrinterConfig {
  paperWidth: PaperWidth;
  /**
   * Print as soon as a sale completes, rather than waiting for a click.
   *
   * Only worth enabling once the browser is set up for silent printing —
   * otherwise it just opens the print dialog by itself, which is worse
   * than a button. See docs/hardware/anypay-printer.md.
   */
  autoPrint: boolean;
  /**
   * Extra inset inside the printable area, in millimetres.
   *
   * Normally 0. Raise it only if a particular printer clips the edges of
   * its own printable width.
   */
  marginMm: number;
}

export const PRINTER_DEFAULTS: PrinterConfig = {
  paperWidth: '80mm',
  autoPrint: false,
  // Zero: the receipt is already laid out at the printable width and
  // centred on the paper. Extra inset only narrows the text further.
  marginMm: 0,
};

/** Characters per line at the receipt's monospace size, per paper width. */
export const CHARS_PER_LINE: Record<PaperWidth, number> = {
  '80mm': 40,
  '58mm': 28,
};

/**
 * Printable width for each paper size — narrower than the paper itself.
 *
 * A thermal head does not span the full roll: at 203dpi an 80mm roll
 * prints 576 dots (72mm) and a 58mm roll prints 384 (48mm). Laying the
 * receipt out at the paper width instead of this one is what chopped
 * characters off the right-hand edge of every line.
 */
export const PRINTABLE_WIDTH: Record<PaperWidth, string> = {
  '80mm': '72mm',
  '58mm': '48mm',
};

const STORAGE_KEY = 'printerConfig';

export async function loadPrinterConfig(): Promise<PrinterConfig> {
  try {
    const stored = await getMeta<Partial<PrinterConfig>>(STORAGE_KEY);
    return { ...PRINTER_DEFAULTS, ...(stored ?? {}) };
  } catch {
    return { ...PRINTER_DEFAULTS };
  }
}

export async function savePrinterConfig(config: PrinterConfig): Promise<void> {
  await setMeta(STORAGE_KEY, config);
}
