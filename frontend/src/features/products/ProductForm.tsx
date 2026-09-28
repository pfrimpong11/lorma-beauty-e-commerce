'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormModal } from '@/components/ui/FormModal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import { toast } from '@/store/toast';
import { BarcodeManager } from './BarcodeManager';
import { VariantManager } from './VariantManager';
import { SIZE_GROUPS } from './sizes';

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  category: { id: string; name: string };
  sellingPrice: string;
  costPrice: string;
  stock: number;
  minStockLevel: number;
  tracksExpiry?: boolean;
  variantName?: string | null;
  variantGroupId?: string | null;
}

const UNITS = ['PIECE', 'BOTTLE', 'TUBE', 'JAR', 'SACHET', 'PACK', 'SET', 'ML', 'GRAM'] as const;

const EMPTY = {
  name: '',
  sku: '',
  barcode: '',
  brand: '',
  categoryId: '',
  costPrice: '',
  sellingPrice: '',
  minStockLevel: '0',
  unit: 'PIECE',
  tracksExpiry: false,
  variantName: '',
  openingStock: '',
  openingBatchNumber: '',
  openingExpiryDate: '',
};

/**
 * Create or edit a product.
 *
 * Prices are only editable while creating. Changing the price of an
 * existing product needs a separate permission and a recorded reason
 * (§51.4), so it has its own dialog — see ChangePriceForm.
 */
export function ProductForm({
  open,
  editing,
  onClose,
  /** Prefills the barcode — used when creating from an unknown scan. */
  initialBarcode,
}: {
  open: boolean;
  editing: ProductRow | null;
  onClose: () => void;
  initialBarcode?: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  /** Once the SKU is typed by hand, stop overwriting it. */
  const [skuEdited, setSkuEdited] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ data: Array<{ id: string; name: string }> }>('/categories'),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            ...EMPTY,
            name: editing.name,
            sku: editing.sku,
            barcode: editing.barcode ?? '',
            brand: editing.brand ?? '',
            categoryId: editing.category.id,
            costPrice: editing.costPrice,
            sellingPrice: editing.sellingPrice,
            minStockLevel: String(editing.minStockLevel),
          }
        : { ...EMPTY, barcode: initialBarcode ?? '' },
    );
    setSkuEdited(false);
  }, [open, editing, initialBarcode]);

  // Kept in a ref so the debounce below does not need to re-fire when the
  // flag flips.
  const skuEditedRef = useRef(false);
  skuEditedRef.current = skuEdited;

  const suggestSku = useCallback(async (name: string, categoryId: string) => {
    setSuggesting(true);
    try {
      const params = new URLSearchParams();
      if (categoryId) params.set('categoryId', categoryId);
      if (name.trim()) params.set('name', name.trim());
      const result = await api.get<{ sku: string }>(
        `/products/sku-suggestion?${params.toString()}`,
      );
      setForm((current) => (current.sku === '' || !skuEditedRef.current
        ? { ...current, sku: result.sku }
        : current));
    } catch {
      // A failed suggestion is not worth interrupting the form for —
      // the field stays editable and the server validates on save.
    } finally {
      setSuggesting(false);
    }
  }, []);

  /**
   * Fill the SKU from the product name and category (§ auto-generate).
   *
   * Debounced, because it asks the server for the next free number in
   * that category's series — one call per keystroke would be wasteful and
   * would fight the typist.
   */
  useEffect(() => {
    if (!open || editing || skuEdited) return;
    if (form.name.trim().length < 2 && !form.categoryId) return;

    const timer = setTimeout(() => {
      void suggestSku(form.name, form.categoryId);
    }, 400);
    return () => clearTimeout(timer);
  }, [open, editing, skuEdited, form.name, form.categoryId, suggestSku]);

  const refresh = () => {
    for (const key of ['products', 'inventory', 'dashboard', 'expiry']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const submit = async () => {
    const shared = {
      name: form.name.trim(),
      ...(form.barcode.trim() ? { barcode: form.barcode.trim() } : {}),
      ...(form.brand.trim() ? { brand: form.brand.trim() } : {}),
      categoryId: form.categoryId,
      minStockLevel: Number(form.minStockLevel) || 0,
      unit: form.unit,
    };

    if (editing) {
      await api.patch(`/products/${editing.id}`, shared);
      toast.success(`${shared.name} updated.`);
    } else {
      await api.post('/products', {
        ...shared,
        sku: form.sku.trim().toUpperCase(),
        costPrice: Number(form.costPrice).toFixed(2),
        sellingPrice: Number(form.sellingPrice).toFixed(2),
        tracksExpiry: form.tracksExpiry,
        ...(form.variantName ? { variantName: form.variantName } : {}),
        openingStock: Number(form.openingStock) || 0,
        ...(form.tracksExpiry && Number(form.openingStock) > 0
          ? {
              openingBatchNumber: form.openingBatchNumber.trim(),
              openingExpiryDate: form.openingExpiryDate,
            }
          : {}),
      });
      toast.success(`${shared.name} added.`);
    }
    refresh();
  };

  const invalid =
    form.name.trim().length < 2 ||
    !form.categoryId ||
    (!editing &&
      (form.sku.trim().length < 2 ||
        form.costPrice === '' ||
        form.sellingPrice === '' ||
        Number(form.sellingPrice) < Number(form.costPrice) ||
        (form.tracksExpiry &&
          Number(form.openingStock) > 0 &&
          (form.openingBatchNumber.trim().length < 1 || !form.openingExpiryDate))));

  const margin =
    form.costPrice && form.sellingPrice && Number(form.sellingPrice) > 0
      ? ((Number(form.sellingPrice) - Number(form.costPrice)) / Number(form.sellingPrice)) * 100
      : null;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : 'Add product'}
      submitLabel={editing ? 'Save changes' : 'Add product'}
      onSubmit={submit}
      disabled={invalid}
    >
      {(fieldError) => (
        <>
          <Input
            label="Product name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Vitamin C Brightening Serum 30ml"
            error={fieldError('name')}
            required
            data-autofocus
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="SKU"
              value={form.sku}
              onChange={(e) => {
                setSkuEdited(true);
                setForm({ ...form, sku: e.target.value });
              }}
              placeholder="LMB-SER-001"
              className="font-mono"
              disabled={editing !== null}
              hint={
                editing
                  ? 'SKU cannot be changed'
                  : skuEdited
                    ? 'Your own code — it will not be overwritten'
                    : 'Generated from the name and category. Type to override.'
              }
              error={fieldError('sku')}
              required={!editing}
              trailing={
                editing ? undefined : suggesting ? (
                  <span
                    className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent"
                    aria-label="Finding the next code"
                  />
                ) : skuEdited ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSkuEdited(false);
                      void suggestSku(form.name, form.categoryId);
                    }}
                    className="text-xs font-medium text-brand-700 hover:text-brand-800"
                  >
                    Auto
                  </button>
                ) : undefined
              }
            />
            {editing ? (
              <Input
                label="Barcodes"
                value={`Managed below`}
                readOnly
                hint="A product can carry several — see the list at the bottom"
              />
            ) : (
              <Input
                label="Barcode"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="Scan or type"
                className="font-mono"
                hint="Becomes the primary code. Add more after saving."
                error={fieldError('barcode')}
                data-barcode-input
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              placeholder="Choose a category"
              options={(categories?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              error={fieldError('categoryId')}
              required
            />
            <Input
              label="Brand"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              placeholder="Optional"
              error={fieldError('brand')}
            />
          </div>

          {!editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Cost price"
                type="number"
                step="0.01"
                min={0}
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                error={fieldError('costPrice')}
                required
              />
              <Input
                label="Selling price"
                type="number"
                step="0.01"
                min={0}
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                hint={margin !== null ? `${margin.toFixed(0)}% margin` : undefined}
                error={
                  form.costPrice &&
                  form.sellingPrice &&
                  Number(form.sellingPrice) < Number(form.costPrice)
                    ? 'Selling price is below cost'
                    : fieldError('sellingPrice')
                }
                required
              />
            </div>
          )}

          {!editing && (
            <div className="rounded-xl border border-line bg-surface-sunken p-4">
              {/* Sized here rather than only after saving, because the stock
                  below is the stock of this size and the two belong together. */}
              <Select
                label="Size"
                value={form.variantName}
                onChange={(e) => setForm({ ...form, variantName: e.target.value })}
                groups={SIZE_GROUPS}
                placeholder="No sizes — sold as one product"
                hint="Pick one only if this product comes in several sizes. You can add the rest after saving."
                wrapperClassName="mb-4"
              />

              <Input
                label="Quantity in stock"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="0"
                value={form.openingStock}
                onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
                hint="How many units you have on the shelf right now. Every sale reduces this automatically."
                error={fieldError('openingStock')}
              />

              {/* A batch-tracked product sells from batches, not from the
                  figure above, so the opening count needs one or the stock
                  reads as present and refuses to sell. */}
              {form.tracksExpiry && Number(form.openingStock) > 0 && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Batch number"
                    value={form.openingBatchNumber}
                    onChange={(e) => setForm({ ...form, openingBatchNumber: e.target.value })}
                    hint="Printed on the carton"
                    error={fieldError('openingBatchNumber')}
                    required
                  />
                  <Input
                    label="Expiry date"
                    type="date"
                    value={form.openingExpiryDate}
                    onChange={(e) => setForm({ ...form, openingExpiryDate: e.target.value })}
                    error={fieldError('openingExpiryDate')}
                    required
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Unit"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              options={UNITS.map((u) => ({
                value: u,
                label: u.charAt(0) + u.slice(1).toLowerCase(),
              }))}
            />
            <Input
              label="Minimum stock level"
              type="number"
              min={0}
              value={form.minStockLevel}
              onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })}
              hint="Flags as low stock at or below this"
              error={fieldError('minStockLevel')}
            />
          </div>

          {!editing && (
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={form.tracksExpiry}
                onChange={(e) => setForm({ ...form, tracksExpiry: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-line text-brand-600"
              />
              <span className="text-sm text-ink">
                Track expiry in batches
                <span className="block text-xs text-ink-subtle">
                  Stock is held per batch and sold first-expiry-first-out. Expired batches can
                  never be sold. This cannot be changed later.
                </span>
              </span>
            </label>
          )}

          {/* Only once the product exists — a barcode needs something to
              attach to. On create, the field above seeds the primary. */}
          {editing && (
            <>
              <BarcodeManager productId={editing.id} />
              {/* Sizes only make sense once the product exists — each one is
                  a product in its own right and needs something to group with. */}
              <VariantManager
                productId={editing.id}
                productName={editing.name}
                tracksExpiry={editing.tracksExpiry ?? false}
              />
            </>
          )}
        </>
      )}
    </FormModal>
  );
}

/**
 * Price changes are separated from ordinary edits: they need their own
 * permission and always carry a reason into the audit log (§19, §51.4).
 */
export function ChangePriceForm({
  open,
  product,
  onClose,
}: {
  open: boolean;
  product: ProductRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open && product) {
      setCostPrice(product.costPrice);
      setSellingPrice(product.sellingPrice);
      setReason('');
    }
  }, [open, product]);

  const submit = async () => {
    if (!product) return;
    await api.patch(`/products/${product.id}/price`, {
      costPrice: Number(costPrice).toFixed(2),
      sellingPrice: Number(sellingPrice).toFixed(2),
      reason: reason.trim(),
    });
    toast.success(`${product.name} repriced.`);
    for (const key of ['products', 'inventory', 'dashboard']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const belowCost = Number(sellingPrice) < Number(costPrice);
  const invalid = reason.trim().length < 3 || costPrice === '' || sellingPrice === '' || belowCost;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Change price — ${product?.name ?? ''}`}
      description="Recorded in the audit log with the reason you give."
      submitLabel="Change price"
      onSubmit={submit}
      disabled={invalid}
      size="sm"
    >
      {(fieldError) => (
        <>
          <div className="flex justify-between rounded-lg bg-surface-sunken px-3 py-2.5 text-sm">
            <span className="text-ink-muted">Currently</span>
            <span className="font-semibold tabular text-ink">
              {product?.sellingPrice} (cost {product?.costPrice})
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Cost price"
              type="number"
              step="0.01"
              min={0}
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              error={fieldError('costPrice')}
              required
            />
            <Input
              label="Selling price"
              type="number"
              step="0.01"
              min={0}
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              error={belowCost ? 'Selling price is below cost' : fieldError('sellingPrice')}
              required
              data-autofocus
            />
          </div>
          <Input
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Supplier increase from 1 October"
            hint="Appears in the audit log against your name"
            error={fieldError('reason')}
            required
          />
        </>
      )}
    </FormModal>
  );
}
