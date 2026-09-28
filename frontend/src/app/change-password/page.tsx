'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';

/**
 * First-sign-in password change.
 *
 * Accounts created by an administrator are flagged `mustChangePassword`,
 * because the person who created it knows the password they typed in.
 * Until this is done the account is not really the staff member's own, so
 * the shells route here and nowhere else.
 *
 * Changing it bumps the account's token version server-side, which
 * invalidates every existing session — so the last step is signing in
 * again with the new password.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, status, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const sameAsOld = newPassword.length > 0 && newPassword === currentPassword;

  const invalid =
    !currentPassword || newPassword.length < 8 || newPassword !== confirm || sameAsOld;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (invalid) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed.', 'Sign in with your new password.');
      await logout();
      router.replace('/login');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'The password could not be changed.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <p className="text-xl font-semibold tracking-[0.18em] text-brand-700">LORMA BEAUTY</p>
        <p className="mt-0.5 text-xs tracking-wide text-ink-subtle">Skincare &amp; Beauty</p>

        <h1 className="mt-8 text-xl font-semibold text-ink">
          {user.mustChangePassword ? 'Set your password' : 'Change your password'}
        </h1>
        <p className="mt-1 text-sm text-ink-subtle">
          {user.mustChangePassword
            ? `Welcome, ${user.firstName}. Choose a password only you know before you start.`
            : 'You will be signed out and asked to sign in again.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Input
            label={user.mustChangePassword ? 'The password you were given' : 'Current password'}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            data-autofocus
            autoFocus
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="At least 8 characters"
            error={
              tooShort
                ? 'Use at least 8 characters.'
                : sameAsOld
                  ? 'Choose something different from your current password.'
                  : undefined
            }
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={mismatch ? 'These do not match.' : undefined}
            required
          />

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger"
            >
              {error}
            </div>
          )}

          <Button type="submit" size="lg" fullWidth loading={submitting} disabled={invalid}>
            Save password
          </Button>
        </form>

        {!user.mustChangePassword && (
          <button
            onClick={() => router.back()}
            className="mt-4 w-full text-center text-sm text-ink-subtle transition-colors hover:text-ink"
          >
            Cancel
          </button>
        )}
      </motion.div>
    </main>
  );
}
