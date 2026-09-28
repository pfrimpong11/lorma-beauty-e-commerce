'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Receipt, type ReceiptData } from './Receipt';

/**
 * The copy of the receipt that actually reaches the paper.
 *
 * It is portalled to a direct child of <body> rather than printed where
 * it sits on screen, because printing from inside the dialog produced
 * three faults at once on a real thermal printer:
 *
 *   - a blank third at the top of the slip, because the receipt's
 *     `position: absolute` resolved against the dialog panel (which is
 *     `relative` and vertically centred) instead of the page;
 *   - the receipt cut off mid-way, because the dialog body is an
 *     `overflow-y-auto` scroll container and overflow clips when printed;
 *   - characters chopped off the right edge, because the element was as
 *     wide as the paper with no allowance for the printer's margin.
 *
 * As a direct child of <body> it has no positioned ancestor and no
 * scroll container above it, so none of those can recur.
 *
 * It is not visible on screen — the dialog still shows the preview.
 */
export function ReceiptPrintHost({ data }: { data: ReceiptData | null }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !data) return null;

  return createPortal(
    <div className="receipt-print-host" aria-hidden>
      <Receipt data={data} />
    </div>,
    document.body,
  );
}
