'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { useClientPagination } from '@/hooks/useClientPagination';
import { LoadingState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatAmount, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { toast } from '@/store/toast';
import { useAuth } from '@/store/auth';

const REPORTS = [
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'product-sales', label: 'Product Sales' },
  { key: 'payments', label: 'Payments' },
  { key: 'shifts', label: 'Shifts' },
] as const;

interface ReportResult {
  title: string;
  range: { from: string | null; to: string | null };
  generatedAt: string;
  columns: Array<{ key: string; label: string; money?: boolean; numeric?: boolean }>;
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, string | number>;
}

export default function ReportsPage() {
  const canExport = useAuth((s) => s.can('report.export'));
  const [reportKey, setReportKey] = useState<string>('sales');
  const [range, setRange] = useState({ from: '', to: '' });
  const { from, to } = range;
  const [exporting, setExporting] = useState<string | null>(null);

  const query = new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ['report', reportKey, from, to],
    queryFn: () => api.get<ReportResult>(`/reports/${reportKey}${query ? `?${query}` : ''}`),
  });

  // Reports total the whole result, so the rows all arrive together and
  // are paged here rather than at the API — otherwise the totals below
  // would only describe the visible page.
  const { page, setPage, pages, pageSize, total, pageRows } = useClientPagination(
    data?.rows ?? [],
  );

  const download = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const params = new URLSearchParams({ format, ...(from ? { from } : {}), ...(to ? { to } : {}) });
      const blob = await api.download(`/reports/${reportKey}/export?${params.toString()}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lorma-beauty-${reportKey}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Release the blob once the download has started.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${format.toUpperCase()} export downloaded.`);
    } catch {
      toast.error('The export could not be generated.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Filter by date, then export"
        actions={
          canExport && (
            <>
              <Button
                variant="secondary"
                onClick={() => void download('xlsx')}
                loading={exporting === 'xlsx'}
                disabled={exporting !== null}
              >
                Export Excel
              </Button>
              <Button
                variant="secondary"
                onClick={() => void download('pdf')}
                loading={exporting === 'pdf'}
                disabled={exporting !== null}
              >
                Export PDF
              </Button>
            </>
          )
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-1.5">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              onClick={() => {
                setReportKey(r.key);
                setPage(1);
              }}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                reportKey === r.key
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-line text-ink-muted hover:text-ink',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <DateRangeFilter
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
            className="lg:sticky lg:top-20 lg:shrink-0"
          />

          <Card padded={false} className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
              <p className="text-sm font-medium text-ink">{data?.title ?? 'Report'}</p>

              {data && (
                <div className="flex flex-col items-end gap-1">
                  {/*
                    The totals belong with the report's identity, not below
                    its last row: on a report long enough to paginate they
                    were pushed off the bottom of the screen, which is where
                    the one number most people came for was hiding.
                  */}
                  {data.totals && (
                    <div className="flex flex-wrap justify-end gap-x-5 gap-y-1">
                      {Object.entries(data.totals).map(([key, value]) => (
                        <span key={key} className="text-sm">
                          <span className="text-ink-subtle">
                            {/* stockValue -> "stock Value" */}
                            {key.replace(/([a-z])([A-Z])/g, '$1 $2')}:{' '}
                          </span>
                          <span className="font-semibold tabular text-ink">
                            {/amount|value|revenue|variance/i.test(key)
                              ? formatAmount(String(value))
                              : String(value)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-ink-subtle">
                    Generated {formatDateTime(data.generatedAt)}
                  </p>
                </div>
              )}
            </div>

          {isLoading || !data ? (
            <LoadingState label="Running report" />
          ) : (
            <>
              <DataTable
                rows={pageRows.map((row, i) => ({ ...row, id: String(i) }))}
                emptyTitle="No data in this period"
                emptyDescription="Try widening the date range."
                columns={data.columns.map((col) => ({
                  key: col.key,
                  header: col.label,
                  align: col.money || col.numeric ? ('right' as const) : ('left' as const),
                  render: (row: Record<string, unknown>) => {
                    const value = row[col.key];
                    if (value === null || value === undefined) return '—';
                    return col.money ? formatAmount(String(value)) : String(value);
                  },
                }))}
              />

              <Pagination
                page={page}
                pages={pages}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
              />

            </>
          )}
          </Card>
        </div>
      </div>
    </>
  );
}
