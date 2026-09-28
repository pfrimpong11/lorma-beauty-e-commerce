'use client';

import { create } from 'zustand';
import { api, setAccessToken } from '@/lib/api';
import { clearLocalData } from '@/lib/db';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  mustChangePassword?: boolean;
}

interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

interface AuthState {
  user: SessionUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',

  login: async (email, password) => {
    const result = await api.post<LoginResponse>(
      '/auth/login',
      { email, password },
      { skipRefresh: true },
    );
    setAccessToken(result.accessToken);
    set({ user: result.user, status: 'authenticated' });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Signing out locally must succeed even if the server is unreachable.
    }
    setAccessToken(null);
    // The offline queue is intentionally preserved — see clearLocalData.
    await clearLocalData().catch(() => undefined);
    set({ user: null, status: 'anonymous' });
  },

  /**
   * Re-establish the session on load from the httpOnly refresh cookie.
   * The access token lives in memory, so every reload starts here.
   */
  restore: async () => {
    try {
      const result = await api.post<LoginResponse>('/auth/refresh', undefined, {
        skipRefresh: true,
      });
      setAccessToken(result.accessToken);
      set({ user: result.user, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'anonymous' });
    }
  },

  can: (permission) => get().user?.permissions.includes(permission) ?? false,
  canAny: (...permissions) => {
    const held = get().user?.permissions;
    return held ? permissions.some((p) => held.includes(p)) : false;
  },
}));
