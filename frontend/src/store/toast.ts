'use client';

import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  description?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const DURATION: Record<ToastVariant, number> = {
  success: 3000,
  info: 4000,
  warning: 6000,
  // Errors stay until dismissed; a cashier must not miss a failed sale.
  error: 9000,
};

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { ...toast, id }] });
    setTimeout(() => get().dismiss(id), DURATION[toast.variant]);
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message: string, description?: string) =>
    useToasts.getState().push({ variant: 'success', message, description }),
  error: (message: string, description?: string) =>
    useToasts.getState().push({ variant: 'error', message, description }),
  warning: (message: string, description?: string) =>
    useToasts.getState().push({ variant: 'warning', message, description }),
  info: (message: string, description?: string) =>
    useToasts.getState().push({ variant: 'info', message, description }),
};
