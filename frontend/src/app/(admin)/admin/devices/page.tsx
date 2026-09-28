'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/States';
import { scanner } from '@/lib/scanner/manager';
import { FR20_DEFAULTS, loadScannerConfig } from '@/lib/scanner/config';
import type { ScanEvent, ScannerConfig } from '@/lib/scanner/types';
import { useScanner, useScannerStats } from '@/hooks/useScanner';
import { findCachedByBarcode } from '@/lib/db';
import { formatRelative } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Receipt, type ReceiptData } from '@/features/pos/Receipt';
import { ReceiptPrintHost } from '@/features/pos/ReceiptPrintHost';
import { printReceipt } from '@/lib/printer/print';
import {
  CHARS_PER_LINE,
  PRINTER_DEFAULTS,
  loadPrinterConfig,
  savePrinterConfig,
  type PrinterConfig,
} from '@/lib/printer/config';
import { toast } from '@/store/toast';
import { cn } from '@/lib/cn';

interface TestResult extends ScanEvent {
  matched: string | null;
}

/** A sample receipt, so the printer can be checked without a real sale. */
const TEST_RECEIPT: ReceiptData = {
  receiptNumber: 'TEST-000000',
  soldAt: new Date().toISOString(),
  cashierName: 'Test print',
  customerName: 'Walk-in Customer',
  items: [
    { productName: 'Vitamin C Brightening Serum 30ml', quantity: 1, lineTotal: '120.00' },
    { productName: 'Broad Spectrum SPF 50 Sunscreen 50ml', quantity: 2, lineTotal: '180.00' },
  ],
  subtotal: '300.00',
  discountAmount: '20.00',
  total: '280.00',
  payments: [{ method: 'MOBILE_MONEY', amount: '280.00' }],
};

/**
 * Scanner and printer setup.
 *
 * Neither device needs this page to work — the till scans and prints on
 * its own. It exists so both can be verified without ringing up a sale,
 * and so settings can be matched to different hardware without a rebuild.
 */
export default function DevicesPage() {
  const stats = useScannerStats();
  const [config, setConfig] = useState<ScannerConfig | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [manual, setManual] = useState('');
  const [saving, setSaving] = useState(false);

  const [printer, setPrinter] = useState<PrinterConfig | null>(null);
  const [printerSaving, setPrinterSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    void loadScannerConfig().then(setConfig);
    void loadPrinterConfig().then(setPrinter);
  }, []);

  useScanner(
    useCallback(async (event: ScanEvent) => {
      const match = await findCachedByBarcode(event.code);
      setResults((prev) => [{ ...event, matched: match?.name ?? null }, ...prev].slice(0, 12));
    }, []),
  );

  const update = (patch: Partial<ScannerConfig>) =>
    setConfig((current) => (current ? { ...current, ...patch } : current));

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await scanner.updateConfig(config);
      toast.success('Scanner settings saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Devices"
        description="Barcode scanner and receipt printer for this till"
      />

      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Scans this session" value={stats.scanCount} />
          <StatCard
            label="Last scan"
            value={formatRelative(stats.lastScanAt ? new Date(stats.lastScanAt) : null)}
          />
        </div>

        <div className="rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">
          The FR20 connects as a keyboard, so the browser cannot tell whether it is plugged in.
          Scanning is always ready on the Sell screen — if a scan does nothing, test it here first.
        </div>

        <Card padded={false}>
          <div className="border-b border-line p-5 pb-4">
            <CardHeader
              title="Test a scan"
              subtitle="Scan a product, or type a barcode and press Enter. Nothing is added to the cart."
              action={
                results.length > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => setResults([])}>
                    Clear
                  </Button>
                ) : undefined
              }
            />
            <div className="flex gap-2">
              <Input
                data-barcode-input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manual.trim()) {
                    scanner.simulate(manual);
                    setManual('');
                  }
                }}
                placeholder="Type a barcode and press Enter"
                aria-label="Simulate a barcode"
                className="font-mono"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  if (manual.trim()) {
                    scanner.simulate(manual);
                    setManual('');
                  }
                }}
              >
                Test
              </Button>
            </div>
          </div>

          {results.length === 0 ? (
            <EmptyState
              title="Waiting for a scan"
              description="Point a product at the scanner, or type a barcode above."
            />
          ) : (
            <ul className="divide-y divide-line">
              {results.map((result) => (
                <li key={result.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-ink">{result.code}</span>
                    {result.matched ? (
                      <Badge tone="success">{result.matched}</Badge>
                    ) : (
                      <Badge tone="warning">Not in catalogue</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-subtle">
                    {result.code.length} characters
                    {result.durationMs > 0 && ` · read in ${result.durationMs}ms`}
                    {result.raw !== result.code && ` · raw: ${JSON.stringify(result.raw)}`}
                  </p>
                  {result.durationMs > 200 && (
                    <p className="mt-1 text-xs text-warning">
                      That took {result.durationMs}ms — slow for a scanner. Expected if you typed
                      it; if it came from the FR20, raise the key interval below.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {config && (
          <Card>
            <CardHeader
              title="Reading settings"
              subtitle="Match these to how the scanner is programmed. Defaults suit a factory-fresh FR20."
              action={
                <Button size="sm" variant="ghost" onClick={() => setConfig({ ...FR20_DEFAULTS })}>
                  Reset to FR20 defaults
                </Button>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Minimum barcode length"
                type="number"
                min={1}
                max={64}
                value={config.minLength}
                onChange={(e) => update({ minLength: Number(e.target.value) })}
                hint="Shorter reads are ignored as stray keystrokes"
              />
              <Input
                label="Max gap between characters (ms)"
                type="number"
                min={5}
                max={200}
                value={config.maxKeyIntervalMs}
                onChange={(e) => update({ maxKeyIntervalMs: Number(e.target.value) })}
                hint="Anything slower is treated as typing, not scanning"
              />
              <Input
                label="Idle completion (ms)"
                type="number"
                min={20}
                max={500}
                value={config.idleCompleteMs}
                onChange={(e) => update({ idleCompleteMs: Number(e.target.value) })}
                hint="Used when the scanner sends no Enter at the end"
              />
              <Input
                label="Same-code cooldown (ms)"
                type="number"
                min={0}
                max={5000}
                value={config.sameCodeCooldownMs}
                onChange={(e) => update({ sameCodeCooldownMs: Number(e.target.value) })}
                hint="Leave at 0. Scanning one item five times should add five."
              />
              <Input
                label="Prefix to strip"
                value={config.prefix}
                onChange={(e) => update({ prefix: e.target.value })}
                placeholder="none"
                className="font-mono"
              />
              <Input
                label="Suffix to strip"
                value={config.suffix}
                onChange={(e) => update({ suffix: e.target.value })}
                placeholder="none"
                className="font-mono"
              />
            </div>

            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-medium text-ink">End-of-scan key</legend>
              <div className="flex gap-2">
                {(['Enter', 'Tab'] as const).map((key) => {
                  const on = config.terminators.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        update({
                          terminators: on
                            ? config.terminators.filter((t) => t !== key)
                            : [...config.terminators, key],
                        })
                      }
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                        on
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-line text-ink-muted hover:text-ink',
                      )}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="mt-4 flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={config.sound}
                onChange={(e) => update({ sound: e.target.checked })}
                className="h-4 w-4 rounded border-line text-brand-600"
              />
              <span className="text-sm text-ink">
                Confirmation tone on each accepted scan
                <span className="block text-xs text-ink-subtle">
                  Separate from the scanner&apos;s own beep, which fires on a successful read even
                  when the product is unknown
                </span>
              </span>
            </label>

            <div className="mt-5 flex justify-end">
              <Button onClick={save} loading={saving}>
                Save settings
              </Button>
            </div>
          </Card>
        )}

        {/* ---- printer ------------------------------------------------ */}
        {printer && (
          <Card>
            <CardHeader
              title="Receipt printer"
              subtitle="Prints through this computer's printer driver — set the AnyPay printer as the default printer."
              action={
                <Button size="sm" variant="secondary" onClick={() => setTestOpen(true)}>
                  Test print
                </Button>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Paper width"
                value={printer.paperWidth}
                onChange={(e) =>
                  setPrinter({ ...printer, paperWidth: e.target.value as PrinterConfig['paperWidth'] })
                }
                options={[
                  { value: '80mm', label: '80mm (standard desktop)' },
                  { value: '58mm', label: '58mm (compact)' },
                ]}
              />
              <Input
                label="Margin (mm)"
                type="number"
                min={0}
                max={10}
                value={printer.marginMm}
                onChange={(e) => setPrinter({ ...printer, marginMm: Number(e.target.value) })}
                hint={`About ${CHARS_PER_LINE[printer.paperWidth]} characters per line`}
              />
            </div>

            <label className="mt-4 flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={printer.autoPrint}
                onChange={(e) => setPrinter({ ...printer, autoPrint: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-line text-brand-600"
              />
              <span className="text-sm text-ink">
                Print automatically when a sale completes
                <span className="block text-xs text-ink-subtle">
                  Only enable this once the browser is set up for silent printing — otherwise it
                  opens the print dialog by itself, which is slower than pressing the button.
                </span>
              </span>
            </label>

            <div className="mt-4 rounded-lg border border-line bg-surface-sunken p-3 text-xs leading-relaxed text-ink-muted">
              <p className="font-medium text-ink">Printing without a dialog</p>
              <p className="mt-1">
                Browsers cannot suppress the print dialog from a web page. To print straight to
                paper, launch Chrome on this workstation with the kiosk-printing flag and set the
                AnyPay printer as the default. Setup is in the printer guide under docs/hardware.
              </p>
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                onClick={async () => {
                  setPrinterSaving(true);
                  try {
                    await savePrinterConfig(printer);
                    toast.success('Printer settings saved.');
                  } finally {
                    setPrinterSaving(false);
                  }
                }}
                loading={printerSaving}
              >
                Save printer settings
              </Button>
            </div>
          </Card>
        )}
      </div>

      <ReceiptPrintHost data={testOpen ? TEST_RECEIPT : null} />

      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Test print"
        description="A sample receipt. Nothing is recorded."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTestOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void printReceipt()} data-autofocus>
              Print
            </Button>
          </>
        }
      >
        <div className="rounded-lg border border-line">
          <Receipt data={TEST_RECEIPT} />
        </div>
      </Modal>
    </>
  );
}
