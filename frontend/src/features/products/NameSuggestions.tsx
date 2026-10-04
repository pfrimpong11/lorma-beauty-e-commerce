'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/cn';

export interface ProductSuggestion {
  id: string;
  name: string;
  sku: string;
  variantName: string | null;
  brand: string | null;
  category: { id: string; name: string };
  unit: string;
  costPrice: string;
  sellingPrice: string;
  minStockLevel: number;
  tracksExpiry: boolean;
  stock: number;
}

/**
 * Products that already exist under the name being typed.
 *
 * Adding a second size, or a line that differs only in strength, means
 * re-entering a category, brand, unit and two prices that are already on
 * record. Picking the existing product copies those across so only what
 * actually differs has to be typed.
 *
 * It is a starting point, never a link: nothing is shared with the product
 * chosen, and the name stays editable afterwards.
 */
export function NameSuggestions({
  query,
  skip,
  onPick,
}: {
  query: string;
  /** The product being edited — it should not suggest itself. */
  skip?: string;
  onPick: (product: ProductSuggestion) => void;
}) {
  const [matches, setMatches] = useState<ProductSuggestion[]>([]);
  const [dismissed, setDismissed] = useState(false);
  // Identifies the query a response belongs to, so a slow one cannot
  // overwrite the results of a later, faster one.
  const latest = useRef(0);

  const term = query.trim();

  useEffect(() => {
    setDismissed(false);
  }, [term]);

  useEffect(() => {
    if (term.length < 2) {
      setMatches([]);
      return;
    }

    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ data: ProductSuggestion[] }>(
          `/products?search=${encodeURIComponent(term)}&pageSize=5`,
        );
        if (ticket !== latest.current) return;
        setMatches(res.data.filter((p) => p.id !== skip));
      } catch {
        // Offline, or the search failed. Suggestions are a convenience;
        // the form works without them.
        if (ticket === latest.current) setMatches([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [term, skip]);

  if (dismissed || matches.length === 0) return null;

  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-line bg-surface-raised shadow-card">
      <p className="border-b border-line px-3 py-1.5 text-xs text-ink-subtle">
        Already in the catalogue — pick one to copy its details
      </p>
      <ul className="divide-y divide-line">
        {matches.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                onPick(p);
                setDismissed(true);
              }}
              className={cn(
                'tap flex w-full items-center justify-between gap-3 px-3 py-2 text-left',
                'transition-colors hover:bg-brand-50',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {p.name}
                  {p.variantName && (
                    <span className="ml-1.5 font-normal text-ink-subtle">· {p.variantName}</span>
                  )}
                </span>
                <span className="block font-mono text-[11px] text-ink-subtle">
                  {p.sku} · {p.category.name}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular text-ink">
                  {formatAmount(p.sellingPrice)}
                </span>
                <span className="block text-[11px] text-ink-subtle">{p.stock} in stock</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="w-full border-t border-line px-3 py-1.5 text-xs text-ink-subtle hover:text-ink"
      >
        None of these — it is a new product
      </button>
    </div>
  );
}
