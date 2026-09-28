'use client';

import { Button } from './Button';
import { Input } from './Input';
import { cn } from '@/lib/cn';

export interface DateRange {
  from: string;
  to: string;
}

/** Ranges an owner actually asks for, so most reports need no typing. */
const PRESETS: Array<{ label: string; range: () => DateRange }> = [
  { label: 'Today', range: () => ({ from: iso(0), to: iso(0) }) },
  { label: 'Last 7 days', range: () => ({ from: iso(6), to: iso(0) }) },
  { label: 'Last 30 days', range: () => ({ from: iso(29), to: iso(0) }) },
  {
    label: 'This month',
    range: () => {
      const now = new Date();
      return { from: toInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(0) };
    },
  },
];

function iso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toInput(d);
}

/** Local date, not UTC — `toISOString` shifts the day across timezones. */
function toInput(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Date range filter.
 *
 * Stacked From over To in a self-contained panel rather than sprawling
 * across the page: the two fields read as one control, and the group
 * keeps its width instead of each field filling its own row.
 */
export function DateRangeFilter({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}) {
  const active = Boolean(value.from || value.to);
  const invalid = Boolean(value.from && value.to && value.from > value.to);

  const matches = (preset: DateRange) => preset.from === value.from && preset.to === value.to;

  return (
    <div
      className={cn(
        'w-full rounded-xl border border-line bg-surface-raised p-3 sm:w-64',
        className,
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Date range
        </p>
        {active && (
          <button
            onClick={() => onChange({ from: '', to: '' })}
            className="text-xs font-medium text-brand-700 transition-colors hover:text-brand-800"
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-2">
        <Input
          label="From"
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
        <Input
          label="To"
          type="date"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          error={invalid ? 'Earlier than the start date' : undefined}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const range = preset.range();
          const on = matches(range);
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(range)}
              className={cn(
                'tap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                on
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-line text-ink-muted hover:border-brand-300 hover:text-ink',
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {!active && (
        <p className="mt-2.5 text-xs text-ink-subtle">Showing everything to date.</p>
      )}
    </div>
  );
}
