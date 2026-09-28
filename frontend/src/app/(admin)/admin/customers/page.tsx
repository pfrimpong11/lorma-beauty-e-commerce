'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormModal } from '@/components/ui/FormModal';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { toast } from '@/store/toast';
import { useAuth } from '@/store/auth';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isWalkIn: boolean;
  transactionCount: number;
}

const EMPTY = { name: '', phone: '', email: '', address: '', notes: '' };

export default function CustomersPage() {
  const canManage = useAuth((s) => s.can('customer.manage'));
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [open, setOpen] = useState(false);

  const { rows, meta, isLoading, page, setPage, search, setSearch } =
    usePagedQuery<CustomerRow>('customers', '/customers');

  const startAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const startEdit = async (row: CustomerRow) => {
    if (!canManage || row.isWalkIn) return;
    // The list is a summary; the full record carries address and notes.
    const full = await api.get<{
      name: string; phone: string | null; email: string | null;
      address: string | null; notes: string | null;
    }>(`/customers/${row.id}`);

    setEditing(row);
    setForm({
      name: full.name,
      phone: full.phone ?? '',
      email: full.email ?? '',
      address: full.address ?? '',
      notes: full.notes ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    const body = {
      name: form.name.trim(),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.address.trim() ? { address: form.address.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };

    if (editing) {
      await api.patch(`/customers/${editing.id}`, body);
      toast.success(`${body.name} updated.`);
    } else {
      await api.post('/customers', body);
      toast.success(`${body.name} added.`);
    }
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who shops with Lorma Beauty"
        actions={canManage && <Button onClick={startAdd}>Add customer</Button>}
      />

      <div className="p-4 sm:p-6">
        <Card padded={false}>
          <div className="border-b border-line p-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone or email…"
              aria-label="Search customers"
              wrapperClassName="max-w-xs"
            />
          </div>

          <DataTable<CustomerRow>
            loading={isLoading}
            rows={rows}
            onRowClick={canManage ? (row) => void startEdit(row) : undefined}
            emptyTitle="No customers found"
            emptyDescription="Customers added here can be attached to a sale at the till."
            emptyAction={canManage && <Button onClick={startAdd}>Add a customer</Button>}
            mobileRow={(c) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-ink-subtle">{c.phone ?? 'No phone'}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-subtle">{c.transactionCount} sales</span>
              </div>
            )}
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (c) => (
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">{c.name}</span>
                    {c.isWalkIn && <Badge tone="brand">Default</Badge>}
                  </span>
                ),
              },
              { key: 'phone', header: 'Phone', render: (c) => c.phone ?? '—' },
              { key: 'email', header: 'Email', render: (c) => c.email ?? '—', hideOnMobile: true },
              {
                key: 'transactionCount',
                header: 'Transactions',
                align: 'right',
                render: (c) => c.transactionCount,
              },
              ...(canManage
                ? [
                    {
                      key: 'actions',
                      header: '',
                      align: 'right' as const,
                      render: (c: CustomerRow) =>
                        c.isWalkIn ? (
                          <span className="text-xs text-ink-subtle">—</span>
                        ) : (
                          <span onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="secondary" onClick={() => void startEdit(c)}>
                              Edit
                            </Button>
                          </span>
                        ),
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

      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add customer'}
        description={editing ? undefined : 'Attach them to a sale at the till to build a history.'}
        submitLabel={editing ? 'Save changes' : 'Add customer'}
        onSubmit={save}
        disabled={form.name.trim().length < 2}
        size="sm"
      >
        {(fieldError) => (
          <>
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Akosua Boateng"
              error={fieldError('name')}
              required
              data-autofocus
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+233 24 400 0101"
              hint="How the till finds them fastest"
              error={fieldError('phone')}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Optional"
              error={fieldError('email')}
            />
            <Input
              label="Address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Optional"
              error={fieldError('address')}
            />
            <Input
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. sensitive skin, prefers fragrance-free"
              error={fieldError('notes')}
            />
          </>
        )}
      </FormModal>
    </>
  );
}
