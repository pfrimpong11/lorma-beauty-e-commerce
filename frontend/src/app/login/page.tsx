'use client';

import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { landingPath } from '@/components/shell/nav-items';
import { toast } from '@/store/toast';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useAuth((s) => s.login);
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !user) return;

    // Only follow `next` when it is a same-site path — an absolute URL here
    // would turn the login form into an open redirect.
    const next = params.get('next');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;

    router.replace(safeNext ?? landingPath(user.permissions));
  }, [status, user, router, params]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Signed in successfully.');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.isOffline
            ? 'Cannot reach the server. Check your connection and try again.'
            : err.message
          : 'Unable to sign in. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-surface-sunken lg:flex-row">
      {/* Brand panel — hidden on phones where the form should own the screen */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand-300/20 blur-3xl"
        />
        <div className="relative">
          <p className="text-2xl font-semibold tracking-[0.18em] text-white">LORMA BEAUTY</p>
          <p className="mt-1 text-sm tracking-wide text-white/70">Skincare &amp; Beauty</p>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Serve every customer beautifully — online or off.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            Ring up sales, track stock and close your shift with confidence. The till keeps
            working when the internet does not.
          </p>
        </div>
        <p className="relative text-xs text-white/50">Lorma Beauty POS &amp; Retail Management</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden">
            <p className="text-xl font-semibold tracking-[0.18em] text-brand-700">LORMA BEAUTY</p>
            <p className="mt-0.5 text-xs tracking-wide text-ink-subtle">Skincare &amp; Beauty</p>
          </div>

          <h2 className="text-xl font-semibold text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-ink-subtle">Enter your details to open the till.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@lormabeauty.local"
              disabled={submitting}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={submitting}
            />

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger"
              >
                {error}
              </div>
            )}

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              Sign in
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-ink-subtle">
            Lorma Beauty POS · v1.0
          </p>
        </motion.div>
      </div>
    </main>
  );
}

/**
 * useSearchParams needs a Suspense boundary in the app router; the fallback
 * matches the form's frame so there is no layout shift.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
