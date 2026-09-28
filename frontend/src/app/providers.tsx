'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/Toaster';
import { setUnauthorizedHandler } from '@/lib/api';
import { useAuth } from '@/store/auth';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Offline, a failed fetch should fall back to cached data
            // immediately rather than retrying into a dead network.
            retry: (failureCount, error) => {
              const status = (error as { status?: number }).status;
              if (status === 0 || status === 401 || status === 403) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const restore = useAuth((s) => s.restore);
  const logout = useAuth((s) => s.logout);

  useEffect(() => {
    void restore();
    setUnauthorizedHandler(() => {
      void logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [restore, logout]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Registered after load so it never competes with the first paint.
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration degrades offline support but must not
        // prevent the app from running online.
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
