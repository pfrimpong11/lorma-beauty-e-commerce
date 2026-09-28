'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { useClientPagination } from '@/hooks/useClientPagination';
import { api, ApiError } from '@/lib/api';
import { formatRelative, initials } from '@/lib/format';
import { toast } from '@/store/toast';
import { useAuth } from '@/store/auth';

interface StaffRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: { id: string; name: string };
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
}

const EMPTY = { email: '', firstName: '', lastName: '', phone: '', roleId: '', password: '' };

/** Something memorable to read aloud, that still passes validation. */
function suggestPassword(): string {
  const words = ['Lorma', 'Serum', 'Bloom', 'Petal', 'Amber', 'Cocoa', 'Shea'];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}${Math.floor(1000 + Math.random() * 9000)}!`;
}

export default function StaffPage() {
  const canManage = useAuth((s) => s.can('user.manage'));
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState<StaffRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deactivating, setDeactivating] = useState<StaffRow | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<{ data: StaffRow[] }>('/users?includeInactive=true'),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ data: Role[] }>('/roles'),
    enabled: canManage,
  });

  const { page, setPage, pages, pageSize, total, pageRows } = useClientPagination(
    data?.data ?? [],
  );

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['staff'] });

  const startAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY, password: suggestPassword() });
    setOpen(true);
  };

  const startEdit = (row: StaffRow) => {
    if (!canManage) return;
    setEditing(row);
    setForm({
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone ?? '',
      roleId: row.role.id,
      password: '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (editing) {
      await api.patch(`/users/${editing.id}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        roleId: form.roleId,
      });
      toast.success(`${form.firstName} ${form.lastName} updated.`);
    } else {
      await api.post('/users', {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        roleId: form.roleId,
      });
      // Shown once, because the account forces a change at first sign-in
      // and nobody can look this password up afterwards.
      setCreated({
        name: `${form.firstName.trim()} ${form.lastName.trim()}`,
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
    }
    refresh();
  };

  const resetPassword = async () => {
    if (!resetting) return;
    await api.post(`/users/${resetting.id}/reset-password`, { newPassword });
    setCreated({
      name: `${resetting.firstName} ${resetting.lastName}`,
      email: resetting.email,
      password: newPassword,
    });
    setResetting(null);
    setNewPassword('');
    refresh();
  };

  const setActive = async (row: StaffRow, isActive: boolean) => {
    try {
      await api.patch(`/users/${row.id}`, { isActive });
      toast.success(`${row.firstName} ${row.lastName} ${isActive ? 'reactivated' : 'deactivated'}.`);
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That did not work.');
    }
  };

  const roleOptions = (roles?.data ?? []).map((r) => ({
    value: r.id,
    label: r.description ? `${r.name} — ${r.description}` : r.name,
  }));

  const invalid = editing
    ? form.firstName.trim().length < 1 || form.lastName.trim().length < 1 || !form.roleId
    : form.firstName.trim().length < 1 ||
      form.lastName.trim().length < 1 ||
      !form.roleId ||
      !form.email.includes('@') ||
      form.password.length < 8;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can use Lorma Beauty POS"
        actions={canManage && <Button onClick={startAdd}>Add staff member</Button>}
      />

      <div className="p-4 sm:p-6">
        <Card padded={false}>
          <DataTable<StaffRow>
            loading={isLoading}
            rows={pageRows}
            onRowClick={canManage ? startEdit : undefined}
            emptyTitle="No staff found"
            emptyAction={canManage && <Button onClick={startAdd}>Add the first staff member</Button>}
            mobileRow={(u) => (
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {initials(u.firstName, u.lastName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="truncate text-xs text-ink-subtle">{u.email}</p>
                </div>
                <Badge tone={u.isActive ? 'success' : 'neutral'}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            )}
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (u) => (
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                      {initials(u.firstName, u.lastName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {u.firstName} {u.lastName}
                        {u.id === me?.id && (
                          <span className="ml-1.5 text-xs font-normal text-ink-subtle">(you)</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-ink-subtle">{u.email}</p>
                    </div>
                  </div>
                ),
              },
              { key: 'role', header: 'Role', render: (u) => <Badge tone="brand">{u.role.name}</Badge> },
              { key: 'phone', header: 'Phone', render: (u) => u.phone ?? '—', hideOnMobile: true },
              {
                key: 'lastLoginAt',
                header: 'Last seen',
                render: (u) =>
                  u.mustChangePassword ? (
                    <Badge tone="warning">Not set up yet</Badge>
                  ) : (
                    formatRelative(u.lastLoginAt)
                  ),
                hideOnMobile: true,
              },
              {
                key: 'isActive',
                header: 'Status',
                render: (u) => (
                  <Badge tone={u.isActive ? 'success' : 'neutral'} dot={u.isActive}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                ),
              },
              ...(canManage
                ? [
                    {
                      key: 'actions',
                      header: '',
                      align: 'right' as const,
                      render: (u: StaffRow) => (
                        <span
                          className="flex justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" variant="secondary" onClick={() => startEdit(u)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-line"
                            onClick={() => {
                              setResetting(u);
                              setNewPassword(suggestPassword());
                            }}
                          >
                            Reset password
                          </Button>
                          {u.id !== me?.id &&
                            (u.isActive ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="border border-line"
                                onClick={() => setDeactivating(u)}
                              >
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="border border-line"
                                onClick={() => void setActive(u, true)}
                              >
                                Reactivate
                              </Button>
                            ))}
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

      {/* ---- add / edit ---- */}
      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.firstName} ${editing.lastName}` : 'Add staff member'}
        description={
          editing
            ? undefined
            : 'They will be asked to set their own password the first time they sign in.'
        }
        submitLabel={editing ? 'Save changes' : 'Create account'}
        onSubmit={save}
        disabled={invalid}
      >
        {(fieldError) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="First name"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                error={fieldError('firstName')}
                required
                data-autofocus
              />
              <Input
                label="Last name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                error={fieldError('lastName')}
                required
              />
            </div>

            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@lormabeauty.local"
              hint={editing ? 'Email cannot be changed' : 'They sign in with this'}
              disabled={editing !== null}
              error={fieldError('email')}
              required={!editing}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Optional"
                error={fieldError('phone')}
              />
              <Select
                label="Role"
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                placeholder="Choose a role"
                options={roleOptions}
                error={fieldError('roleId')}
                required
              />
            </div>

            {!editing && (
              <Input
                label="Temporary password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                hint="Give this to them once. They must change it at first sign-in."
                error={
                  form.password.length > 0 && form.password.length < 8
                    ? 'At least 8 characters.'
                    : fieldError('password')
                }
                trailing={
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, password: suggestPassword() })}
                    className="text-xs font-medium text-brand-700 hover:text-brand-800"
                  >
                    New
                  </button>
                }
                required
              />
            )}
          </>
        )}
      </FormModal>

      {/* ---- the one time the password is visible ---- */}
      <FormModal
        open={created !== null}
        onClose={() => setCreated(null)}
        title="Account ready"
        description="Give these details to them now — the password cannot be shown again."
        submitLabel="Done"
        onSubmit={async () => setCreated(null)}
        size="sm"
      >
        {() => (
          <>
            <p className="text-sm text-ink-muted">
              <strong className="text-ink">{created?.name}</strong> can now sign in. They will be
              asked to set their own password straight away.
            </p>
            <dl className="rounded-lg border border-line bg-surface-sunken p-3 text-sm">
              <div className="flex justify-between gap-3 py-1">
                <dt className="text-ink-subtle">Email</dt>
                <dd className="font-mono text-ink">{created?.email}</dd>
              </div>
              <div className="flex justify-between gap-3 py-1">
                <dt className="text-ink-subtle">Temporary password</dt>
                <dd className="font-mono font-semibold text-ink">{created?.password}</dd>
              </div>
            </dl>
          </>
        )}
      </FormModal>

      {/* ---- reset ---- */}
      <FormModal
        open={resetting !== null}
        onClose={() => {
          setResetting(null);
          setNewPassword('');
        }}
        title={`Reset password — ${resetting?.firstName ?? ''} ${resetting?.lastName ?? ''}`}
        description="They will be signed out everywhere and asked to set a new password."
        submitLabel="Reset password"
        submitTone="danger"
        onSubmit={resetPassword}
        disabled={newPassword.length < 8}
        size="sm"
      >
        {(fieldError) => (
          <Input
            label="Temporary password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="Give this to them once"
            error={
              newPassword.length > 0 && newPassword.length < 8
                ? 'At least 8 characters.'
                : fieldError('newPassword')
            }
            trailing={
              <button
                type="button"
                onClick={() => setNewPassword(suggestPassword())}
                className="text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                New
              </button>
            }
            required
            data-autofocus
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          if (deactivating) await setActive(deactivating, false);
        }}
        title={`Deactivate ${deactivating?.firstName ?? ''} ${deactivating?.lastName ?? ''}?`}
        tone="danger"
        confirmLabel="Deactivate"
        message="They will be signed out immediately and cannot sign in again. Their sales history is kept, and you can reactivate them at any time."
      />
    </>
  );
}
