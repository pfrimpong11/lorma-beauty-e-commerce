'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { PAGE_SIZE } from '@/hooks/useClientPagination';
import { EmptyState, TableSkeleton } from './States';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Hidden below the sm breakpoint; the card layout shows it instead. */
  hideOnMobile?: boolean;
  sortable?: boolean;
  width?: string;
  /**
   * Pins the column to the right edge while the table scrolls sideways.
   * Row actions live in the last column, which is exactly the one a narrow
   * screen pushes out of sight — and an action nobody can see does not
   * exist. The cell needs an opaque background of its own so the columns
   * it covers do not show through.
   */
  stickyRight?: boolean;
}

export function DataTable<T extends { id?: string }>({
  columns,
  rows,
  loading,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  onRowClick,
  sortKey,
  sortDirection,
  onSort,
  /** Rendered instead of the table on small screens (§27). */
  mobileRow,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  mobileRow?: (row: T) => ReactNode;
}) {
  if (loading) return <TableSkeleton columns={columns.length} />;

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <>
      {/* Mobile: cards, not a squeezed table */}
      {mobileRow && (
        <ul className="divide-y divide-line sm:hidden">
          {rows.map((row, i) => (
            <li
              key={row.id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('p-4', onRowClick && 'cursor-pointer active:bg-surface-sunken')}
            >
              {mobileRow(row)}
            </li>
          ))}
        </ul>
      )}

      <div className={cn('overflow-x-auto', mobileRow && 'hidden sm:block')}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    !col.align && 'text-left',
                    col.hideOnMobile && 'hidden md:table-cell',
                    col.stickyRight && 'sticky right-0 z-10 bg-surface',
                  )}
                  aria-sort={
                    sortKey === col.key
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {col.sortable && onSort ? (
                    <button
                      onClick={() => onSort(col.key)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                    >
                      {col.header}
                      <span aria-hidden className={cn('text-[9px]', sortKey === col.key ? 'text-brand-600' : 'opacity-40')}>
                        {sortKey === col.key && sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'group transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-surface-sunken',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-ink',
                      col.align === 'right' && 'text-right tabular',
                      col.align === 'center' && 'text-center',
                      col.hideOnMobile && 'hidden md:table-cell',
                      col.stickyRight && 'sticky right-0 z-10 bg-surface group-hover:bg-surface-sunken',
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Page controls.
 *
 * Previous/Next plus a plain "Page n of m" readout — with a page size of
 * 20 the numbers stay small, and numbered links would wrap awkwardly on a
 * phone. The record count stays visible so the size of the result is
 * never a mystery.
 */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) {
    return <div className="border-t border-line px-4 py-3 text-xs text-ink-subtle">No records</div>;
  }

  // Falls back to the shared default rather than a second, drifting copy of
  // it: disagreeing numbers here print a range that does not match the rows.
  const size = pageSize ?? PAGE_SIZE;
  const first = (page - 1) * size + 1;
  const last = Math.min(page * size, total);

  return (
    <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-ink-subtle">
        {pages > 1 ? (
          <>
            <span className="tabular">
              {first}–{last}
            </span>{' '}
            of <span className="tabular">{total}</span>
          </>
        ) : (
          <>
            <span className="tabular">{total}</span> {total === 1 ? 'record' : 'records'}
          </>
        )}
      </p>

      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="tap inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
            Previous
          </button>

          <span className="whitespace-nowrap px-1 text-xs text-ink-muted">
            Page <span className="tabular font-medium text-ink">{page}</span> of{' '}
            <span className="tabular">{pages}</span>
          </span>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            aria-label="Next page"
            className="tap inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
