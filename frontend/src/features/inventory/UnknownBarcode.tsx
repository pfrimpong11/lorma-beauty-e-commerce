'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

/**
 * An unknown barcode is never swallowed (§11).
 *
 * It is nearly always one of two things: a product that is not in the
 * catalogue yet, or a mis-scan. Both get an obvious next step rather than
 * a dead end.
 */
export function UnknownBarcode({
  barcode,
  onClose,
  onCreate,
}: {
  barcode: string | null;
  onClose: () => void;
  onCreate: (barcode: string) => void;
}) {
  return (
    <Modal
      open={barcode !== null}
      onClose={onClose}
      title="Unknown barcode"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Scan again
          </Button>
          <Button onClick={() => barcode && onCreate(barcode)}>Add new product</Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">
        No product carries this barcode:
      </p>
      <p className="mt-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-center font-mono text-base text-ink">
        {barcode}
      </p>
      <p className="mt-3 text-sm text-ink-subtle">
        Add it to an existing product from <strong>Products → Edit → Barcodes</strong>, or create a
        new product with this code already filled in.
      </p>
    </Modal>
  );
}
