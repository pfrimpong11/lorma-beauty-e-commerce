import { PRINTABLE_WIDTH, loadPrinterConfig, type PrinterConfig } from './config';

const STYLE_ID = 'lorma-print-page-rule';

/**
 * Apply the paper size before printing.
 *
 * `@page { size: ... }` cannot read a CSS custom property reliably across
 * browsers, so the rule is written into a dedicated <style> element
 * instead of being toggled with a class.
 *
 * `size: <width> auto` matters for a thermal printer: the roll has no
 * page length, so a fixed height would either pad the receipt with blank
 * paper or clip it. `auto` lets the page end where the content does,
 * which is also where the driver's auto-cutter fires.
 */
function applyPageRule(config: PrinterConfig): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  // The page is the full paper width with no margin; the receipt is laid
  // out at the printable width and centred inside it. Applying a @page
  // margin as well would narrow the content twice and clip it again.
  const printable = PRINTABLE_WIDTH[config.paperWidth];
  // Always explicit, so the screen preview's padding never carries over.
  const inset = `padding: 0 ${Math.max(0, config.marginMm)}mm;`;

  style.textContent = `
    @media print {
      @page { size: ${config.paperWidth} auto; margin: 0; }
      .receipt-print {
        position: static;
        width: ${printable};
        max-width: ${printable};
        margin: 0 auto;
        ${inset}
      }
    }
  `;
}

/**
 * Print the receipt.
 *
 * What reaches the paper is the copy in ReceiptPrintHost — a direct child
 * of <body> — not the one inside the dialog. See that component for why.
 *
 * The browser's print dialog appears unless the workstation's browser is
 * launched with kiosk printing enabled — there is no web API to suppress
 * it, and a page that could print silently by default would be abused.
 * Setup is documented in docs/hardware/anypay-printer.md.
 */
export async function printReceipt(): Promise<void> {
  const config = await loadPrinterConfig();
  applyPageRule(config);

  // A frame lets the style land before the print dialog snapshots layout.
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  window.print();
}

export async function shouldAutoPrint(): Promise<boolean> {
  return (await loadPrinterConfig()).autoPrint;
}
