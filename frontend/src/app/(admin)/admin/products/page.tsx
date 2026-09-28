'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { formatAmount } from '@/lib/format';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAuth } from '@/store/auth';
import {
  ChangePriceForm,
  ProductForm,
  type ProductRow as ProductFormRow,
} from '@/features/products/ProductForm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { api } from '@/lib/api';
import { toast } from '@/store/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface ProductRow {
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
  tracksExpiry: boolean;
  variantName: string | null;
  variantGroupId: string | null;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

export default function ProductsPage() {
  const canCreate = useAuth((s) => s.can('product.create'));
  const canUpdate = useAuth((s) => s.can('product.update'));
  const canPrice = useAuth((s) => s.can('product.update_price'));
  const canDelete = useAuth((s) => s.can('product.deactivate'));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductFormRow | null>(null);
  const [pricing, setPricing] = useState<ProductFormRow | null>(null);
  const [removing, setRemoving] = useState<ProductRow | null>(null);
  const queryClient = useQueryClient();

  const { rows, meta, isLoading, page, setPage, search, setSearch } = usePagedQuery<ProductRow>(
    'products',
    '/products',
    {},
  );

  const startAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  /**
   * The server decides between deleting and deactivating, because only it
   * knows whether the product has been sold. It reports which it did, and
   * that is what the cashier is told.
   */
  const confirmRemove = async () => {
    if (!removing) return;
    const res = await api.delete<{ deleted: boolean; message: string }>(
      `/products/${removing.id}`,
    );
    toast.success(res.message);
    for (const key of ['products', 'inventory', 'dashboard', 'expiry']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const startEdit = (row: ProductRow) => {
    if (!canUpdate) return;
    setEditing(row as ProductFormRow);
    setFormOpen(true);
  };

  /**
   * The row's actions, rendered identically in the table and in the card
   * layout that replaces it on a narrow screen. Defining them once is the
   * point: Delete was added to the table alone and was invisible on a POS
   * terminal, where the card is what shows.
   */
  const rowActions = (p: ProductRow) => (
    <span className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {canUpdate && (
        <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>
          Edit
        </Button>
      )}
      {canPrice && (
        <Button
          size="sm"
          variant="ghost"
          className="border border-line"
          onClick={() => setPricing(p as ProductFormRow)}
        >
          Price
        </Button>
      )}
      {canDelete && (
        <Button
          size="sm"
          variant="ghost"
          className="border border-danger/30 text-danger hover:bg-danger/10"
          onClick={() => setRemoving(p)}
        >
          Delete
        </Button>
      )}
    </span>
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="The Lorma Beauty catalogue"
        actions={canCreate && <Button onClick={startAdd}>Add product</Button>}
      />
      <div className="p-4 sm:p-6">
        <Card padded={false}>
          <div className="border-b border-line p-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, barcode or brand…"
              aria-label="Search products"
              className="max-w-sm"
            />
          </div>

          <DataTable<ProductRow>
            loading={isLoading}
            rows={rows}
            emptyTitle="No products found"
            emptyDescription="Adjust your search, or add a product."
            emptyAction={canCreate && <Button onClick={startAdd}>Add a product</Button>}
            onRowClick={canUpdate ? startEdit : undefined}
            mobileRow={(p) => (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {p.name}
                      {p.variantName && (
                        <span className="ml-1.5 text-ink-subtle">· {p.variantName}</span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-ink-subtle">{p.sku}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular text-ink">{formatAmount(p.sellingPrice)}</p>
                    <p className="text-xs text-ink-subtle">{p.stock} in stock</p>
                  </div>
                </div>
                {(canUpdate || canPrice || canDelete) && (
                  <div className="mt-2.5 flex justify-end">{rowActions(p)}</div>
                )}
              </div>
            )}
            columns={[
              {
                key: 'name',
                header: 'Product',
                render: (p) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {p.name}
                      {/* Sizes share a name, so without the label two rows
                          read as duplicates of each other. */}
                      {p.variantName && (
                        <span className="ml-1.5 text-ink-subtle">· {p.variantName}</span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-ink-subtle">{p.sku}</p>
                  </div>
                ),
              },
              { key: 'category', header: 'Category', render: (p) => p.category.name, hideOnMobile: true },
              { key: 'brand', header: 'Brand', render: (p) => p.brand ?? '—', hideOnMobile: true },
              {
                key: 'sellingPrice',
                header: 'Price',
                align: 'right',
                render: (p) => formatAmount(p.sellingPrice),
              },
              {
                key: 'stock',
                header: 'Stock',
                align: 'right',
                render: (p) =>
                  p.isOutOfStock ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : p.isLowStock ? (
                    <Badge tone="warning">{p.stock} left</Badge>
                  ) : (
                    <span className="tabular">{p.stock}</span>
                  ),
              },
              ...(canUpdate || canPrice || canDelete
                ? [
                    {
                      key: 'actions',
                      header: '',
                      align: 'right' as const,
                      stickyRight: true,
                      render: rowActions,
                    },
                  ]
                : []),
            ]}
          />

          <Pagination
            page={page}
            pages={meta.pages}
            total={meta.total}
            pageSize={meta.pageSize}
            onPageChange={setPage}
          />
        </Card>
      </div>

      <ProductForm open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
      <ChangePriceForm
        open={pricing !== null}
        product={pricing}
        onClose={() => setPricing(null)}
      />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        tone="danger"
        title={`Delete ${removing?.name ?? 'product'}?`}
        confirmLabel="Delete"
        message={
          <>
            <p>
              <span className="font-medium text-ink">{removing?.name}</span> ({removing?.sku}) will
              be removed from the catalogue and will no longer appear at the till.
            </p>
            <p className="mt-2">
              Its barcodes are removed either way, so the same codes can be registered against
              another product afterwards.
            </p>
            <p className="mt-2">
              If it has already been sold, or appears in an approved stock count, it is kept on
              record and only taken off sale — past receipts, returns and reports stay correct.
              Otherwise it is deleted outright.
            </p>
            {removing && removing.stock > 0 && (
              <p className="mt-2 text-warning">
                It still shows {removing.stock} in stock. Count or write that off first if the
                figure matters to you.
              </p>
            )}
          </>
        }
      />
    </>
  );
}
