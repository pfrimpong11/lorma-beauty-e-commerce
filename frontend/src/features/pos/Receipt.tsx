'use client';

import { formatAmount, formatDateTime, humanise } from '@/lib/format';

export interface ReceiptData {
  receiptNumber: string;
  soldAt: string;
  cashierName: string;
  customerName: string;
  items: Array<{ productName: string; quantity: number; lineTotal: string }>;
  subtotal: string;
  discountAmount: string;
  total: string;
  payments: Array<{ method: string; amount: string; amountTendered?: string | null; changeGiven?: string | null }>;
  pendingSync?: boolean;
}

/**
 * Receipt layout (§16). Rendered on screen and printed via the browser —
 * `.receipt-print` is the only thing on the page at print time.
 */
export function Receipt({ data }: { data: ReceiptData }) {
  return (
    <div className="receipt-print mx-auto w-full max-w-[302px] bg-white p-4 font-mono text-[11px] leading-relaxed text-black">
      <div className="text-center">
        <p className="text-sm font-bold tracking-[0.18em]">LORMA BEAUTY</p>
        <p className="text-[10px] tracking-wide">Skincare &amp; Beauty</p>
      </div>

      <div className="my-2.5 border-t border-dashed border-black/40" />

      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>Receipt #:</span>
          <span className="font-bold">{data.receiptNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{formatDateTime(data.soldAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Cashier:</span>
          <span>{data.cashierName}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span>{data.customerName}</span>
        </div>
      </div>

      <div className="my-2.5 border-t border-dashed border-black/40" />

      <table className="w-full">
        <thead>
          <tr className="border-b border-black/20">
            <th className="pb-1 text-left font-normal">Product</th>
            <th className="pb-1 text-center font-normal">Qty</th>
            <th className="pb-1 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i}>
              <td className="py-0.5 pr-1 align-top">{item.productName}</td>
              <td className="py-0.5 text-center align-top">{item.quantity}</td>
              <td className="py-0.5 text-right align-top">{formatAmount(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2.5 border-t border-dashed border-black/40" />

      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatAmount(data.subtotal)}</span>
        </div>
        {Number.parseFloat(data.discountAmount) > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>-{formatAmount(data.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-black/30 pt-1 text-sm font-bold">
          <span>TOTAL:</span>
          <span>{formatAmount(data.total)}</span>
        </div>
      </div>

      <div className="my-2.5 border-t border-dashed border-black/40" />

      {data.payments.map((payment, i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex justify-between">
            <span>Payment:</span>
            <span>{humanise(payment.method)}</span>
          </div>
          {payment.amountTendered && (
            <>
              <div className="flex justify-between">
                <span>Tendered:</span>
                <span>{formatAmount(payment.amountTendered)}</span>
              </div>
              <div className="flex justify-between">
                <span>Change:</span>
                <span>{formatAmount(payment.changeGiven)}</span>
              </div>
            </>
          )}
        </div>
      ))}

      {data.pendingSync && (
        <div className="mt-2.5 border border-black/50 px-2 py-1 text-center text-[10px] font-bold">
          PENDING SYNC
          <div className="font-normal">Saved on this device</div>
        </div>
      )}

      <div className="my-2.5 border-t border-dashed border-black/40" />

      <p className="text-center text-[10px]">Thank you for shopping with Lorma Beauty.</p>
    </div>
  );
}
