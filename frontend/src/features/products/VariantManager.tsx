'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { api, ApiError } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import { toast } from '@/store/toast';
import { cn } from '@/lib/cn';
import { SizeSelect } from './SizeSelect';

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  variantName: string | null;
  variantSort: number;
  sellingPrice: string;
  costPrice: string;
  stock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isActive: boolean;
  barcode: string | null;
}

interface VariantsResponse {
  groupId: string | null;
  baseName: string;
  variants: ProductVariant[];
}

const EMPTY = {
  variantName: '',
  baseVariantName: '',
  sku: '',
  costPrice: '',
  sellingPrice: '',
  openingStock: '',
  barcode: '',
};

/**
 * The sizes a product comes in.
 *
 * Each size is a product in its own right — its own price, stock, barcode
 * and batches — grouped so the till can offer them together. That is why
 * this reads as a list of products rather than a list of labels: a size is
 * something you count and scan, not an attribute.
 */
export function VariantManager({
  productId,
  productName,
  tracksExpiry,
}: {
  productId: string;
  productName: string;
  tracksExpiry: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<ProductVariant | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [detaching, setDetaching] = useState<ProductVariant | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: () => api.get<VariantsResponse>(`/products/${productId}/variants`),
  });

  const variants = data?.variants ?? [];
  const hasSizes = variants.length > 0;
  const taken = variants.map((v) => v.variantName);

  const refreshAll = async () => {
    await refetch();
    for (const key of ['products', 'inventory', 'dashboard']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/products/${productId}/variants`, {
        variantName: form.variantName.trim(),
        ...(hasSizes ? {} : { baseVariantName: form.baseVariantName.trim() }),
        sku: form.sku.trim().toUpperCase(),
        costPrice: Number(form.costPrice).toFixed(2),
        sellingPrice: Number(form.sellingPrice).toFixed(2),
        ...(form.openingStock ? { openingStock: Number(form.openingStock) } : {}),
        ...(form.barcode.trim() ? { barcode: form.barcode.trim() } : {}),
      });
      setForm(EMPTY);
      setAdding(false);
      await refreshAll();
      toast.success(`${form.variantName.trim()} added.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That size could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    if (!renaming) return;
    try {
      await api.patch(`/products/${renaming.id}/variant`, { variantName: renameTo.trim() });
      await refreshAll();
      toast.success('Size renamed.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That size could not be renamed.');
    }
  };

  const detach = async () => {
    if (!detaching) return;
    try {
      await api.delete(`/products/${detaching.id}/variant`);
      await refreshAll();
      toast.success(`${detaching.variantName} is now a product on its own.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That size could not be separated.');
    }
  };

  // Opening stock on an expiry-tracked product needs a batch, which this
  // compact form has no room for. Those sizes are received through
  // Inventory instead, the same route a plain product would take.
  const stockAllowed = !tracksExpiry;

  const invalid =
    form.variantName.trim().length < 1 ||
    form.sku.trim().length < 2 ||
    form.costPrice === '' ||
    form.sellingPrice === '' ||
    Number(form.sellingPrice) < Number(form.costPrice) ||
    (!hasSizes && form.baseVariantName.trim().length < 1);

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Sizes</p>
          <p className="text-xs text-ink-subtle">
            {hasSizes
              ? 'Each size has its own price, stock and barcode.'
              : 'Add a size if this product is sold in more than one, such as Small and Large, or 200ml and 400ml.'}
          </p>
        </div>
        {hasSizes && <Badge tone="neutral">{variants.length} sizes</Badge>}
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-ink-subtle">Loading…</p>
      ) : (
        hasSizes && (
          <ul className="mt-3 divide-y divide-line">
            {variants.map((v) => (
              <li
                key={v.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-2 py-2.5',
                  !v.isActive && 'opacity-55',
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {v.variantName}
                    {v.id === productId && (
                      <span className="ml-2 text-xs font-normal text-ink-subtle">
                        (the one you are editing)
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-xs text-ink-subtle">
                    {v.sku}
                    {v.barcode ? ` · ${v.barcode}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular text-ink">
                      {formatAmount(v.sellingPrice)}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {v.isOutOfStock ? 'Out of stock' : `${v.stock} in stock`}
                    </p>
                  </div>
                  <span className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="border border-line"
                      onClick={() => {
                        setRenaming(v);
                        setRenameTo(v.variantName ?? '');
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="border border-line"
                      onClick={() => setDetaching(v)}
                    >
                      Separate
                    </Button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {adding ? (
        <div className="mt-4 space-y-4 rounded-lg bg-surface-sunken p-3">
          {!hasSizes && (
            <SizeSelect
              label={`What size is the current ${productName}?`}
              value={form.baseVariantName}
              onChange={(size) => setForm({ ...form, baseVariantName: size })}
              taken={[form.variantName]}
              hint="The stock this product already has is a size too, so it needs a name."
              required
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SizeSelect
              label="New size"
              value={form.variantName}
              onChange={(size) => setForm({ ...form, variantName: size })}
              taken={[...taken, form.baseVariantName]}
              required
            />
            <Input
              label="SKU"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              hint="Must be unique"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Cost price"
              type="number"
              min={0}
              step="0.01"
              value={form.costPrice}
              onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
              required
            />
            <Input
              label="Selling price"
              type="number"
              min={0}
              step="0.01"
              value={form.sellingPrice}
              onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
              error={
                form.costPrice &&
                form.sellingPrice &&
                Number(form.sellingPrice) < Number(form.costPrice)
                  ? 'Selling price is below cost'
                  : undefined
              }
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Quantity in stock"
              type="number"
              min={0}
              value={form.openingStock}
              onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
              disabled={!stockAllowed}
              hint={
                stockAllowed
                  ? 'How many of this size you have now'
                  : 'This product tracks expiry — receive this size through Inventory so its batch is recorded'
              }
            />
            <Input
              label="Barcode"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              hint="The code printed on this size"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setForm(EMPTY);
              }}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={invalid || busy}>
              {busy ? 'Adding…' : 'Add size'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setAdding(true)}>
          {hasSizes ? 'Add another size' : 'Add sizes'}
        </Button>
      )}

      <ConfirmDialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        onConfirm={rename}
        title={`Rename ${renaming?.variantName ?? 'size'}`}
        confirmLabel="Rename"
        message={
          <SizeSelect
            label="Size"
            value={renameTo}
            onChange={setRenameTo}
            taken={taken.filter((label) => label !== renaming?.variantName)}
            autoFocus
          />
        }
      />

      <ConfirmDialog
        open={detaching !== null}
        onClose={() => setDetaching(null)}
        onConfirm={detach}
        title={`Separate ${detaching?.variantName ?? 'this size'}?`}
        confirmLabel="Separate"
        message={
          <>
            <p>
              It becomes a product on its own, keeping its stock, price and barcodes. Nothing is
              deleted.
            </p>
            {variants.length === 2 && (
              <p className="mt-2">
                That leaves one size behind, which is not a set, so the other one stops being a
                size too.
              </p>
            )}
          </>
        }
      />
    </div>
  );
}
