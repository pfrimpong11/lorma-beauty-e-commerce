'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { useClientPagination } from '@/hooks/useClientPagination';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/store/toast';
import { useAuth } from '@/store/auth';

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

const EMPTY = { name: '', description: '', sortOrder: 0 };

export default function CategoriesPage() {
  const canManage = useAuth((s) => s.can('category.manage'));
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [open, setOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<CategoryRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ data: CategoryRow[] }>('/categories?includeInactive=true'),
  });

  const { page, setPage, pages, pageSize, total, pageRows } = useClientPagination(
    data?.data ?? [],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    // The POS caches the catalogue, and products are filtered by category.
    void queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const startAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const startEdit = (row: CategoryRow) => {
    if (!canManage) return;
    setEditing(row);
    setForm({
      name: row.name,
      description: row.description ?? '',
      sortOrder: row.sortOrder,
    });
    setOpen(true);
  };

  const save = async () => {
    const body = {
      name: form.name.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      sortOrder: Number(form.sortOrder) || 0,
    };

    if (editing) {
      await api.patch(`/categories/${editing.id}`, body);
      toast.success(`${body.name} updated.`);
    } else {
      await api.post('/categories', body);
      toast.success(`${body.name} added.`);
    }
    refresh();
  };

  const deactivate = useMutation({
    mutationFn: (row: CategoryRow) => api.patch(`/categories/${row.id}`, { isActive: false }),
    onSuccess: (_result, row) => {
      toast.success(`${row.name} deactivated.`);
      refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : 'The category could not be deactivated.',
      ),
  });

  const reactivate = useMutation({
    mutationFn: (row: CategoryRow) => api.patch(`/categories/${row.id}`, { isActive: true }),
    onSuccess: (_result, row) => {
      toast.success(`${row.name} reactivated.`);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'That did not work.'),
  });

  return (
    <>
      <PageHeader
        title="Categories"
        description="How the catalogue is organised"
        actions={canManage && <Button onClick={startAdd}>Add category</Button>}
      />

      <div className="p-4 sm:p-6">
        <Card padded={false}>
          <DataTable<CategoryRow>
            loading={isLoading}
            rows={pageRows}
            onRowClick={canManage ? startEdit : undefined}
            emptyTitle="No categories yet"
            emptyDescription="Categories group products on the POS."
            emptyAction={canManage && <Button onClick={startAdd}>Add the first category</Button>}
            mobileRow={(c) => (
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                <span className="shrink-0 text-xs text-ink-subtle">{c.productCount} products</span>
              </div>
            )}
            columns={[
              {
                key: 'name',
                header: 'Category',
                render: (c) => <span className="font-medium text-ink">{c.name}</span>,
              },
              {
                key: 'description',
                header: 'Description',
                render: (c) => c.description ?? '—',
                hideOnMobile: true,
              },
              {
                key: 'sortOrder',
                header: 'Order',
                align: 'right',
                render: (c) => c.sortOrder,
                hideOnMobile: true,
              },
              { key: 'productCount', header: 'Products', align: 'right', render: (c) => c.productCount },
              {
                key: 'isActive',
                header: 'Status',
                render: (c) => (
                  <Badge tone={c.isActive ? 'success' : 'neutral'}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                ),
              },
              ...(canManage
                ? [
                    {
                      key: 'actions',
                      header: '',
                      align: 'right' as const,
                      render: (c: CategoryRow) => (
                        <span
                          className="flex justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" variant="secondary" onClick={() => startEdit(c)}>
                            Edit
                          </Button>
                          {c.isActive ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeactivating(c)}
                              className="border border-line"
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => reactivate.mutate(c)}
                              className="border border-line"
                            >
                              Reactivate
                            </Button>
                          )}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <Pagination
            page={page}
            pages={pages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </Card>
      </div>

      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add category'}
        description={editing ? undefined : 'Categories group products on the POS.'}
        submitLabel={editing ? 'Save changes' : 'Add category'}
        onSubmit={save}
        size="sm"
        disabled={form.name.trim().length < 2}
      >
        {(fieldError) => (
          <>
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Serums"
              error={fieldError('name')}
              required
              data-autofocus
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional"
              error={fieldError('description')}
            />
            <Input
              label="Sort order"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              hint="Lower numbers appear first on the POS"
              error={fieldError('sortOrder')}
            />
          </>
        )}
      </FormModal>

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          if (deactivating) await deactivate.mutateAsync(deactivating);
        }}
        title={`Deactivate ${deactivating?.name ?? ''}?`}
        tone="danger"
        confirmLabel="Deactivate"
        message={
          deactivating && deactivating.productCount > 0
            ? `${deactivating.name} still has ${deactivating.productCount} active product(s). Move or deactivate them first — the server will refuse otherwise.`
            : 'It will no longer appear on the POS. Nothing is deleted, and you can reactivate it at any time.'
        }
      />
    </>
  );
}
