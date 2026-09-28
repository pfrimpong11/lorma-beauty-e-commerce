'use client';

import { create } from 'zustand';
import {
  getHeldTransactions,
  removeHeldTransaction,
  saveHeldTransaction,
  type CachedProduct,
} from '@/lib/db';

export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPrice: string;
  quantity: number;
  discountAmount: string;
  stock: number;
  tracksExpiry: boolean;
  earliestExpiry: string | null;
}

export interface HeldTransaction {
  id: string;
  heldAt: string;
  lines: CartLine[];
  customerId: string | null;
  customerName: string;
  note: string;
}

interface CartState {
  lines: CartLine[];
  customerId: string | null;
  customerName: string;
  discountType: 'NONE' | 'AMOUNT' | 'PERCENT';
  discountValue: string;
  note: string;
  held: HeldTransaction[];

  addProduct: (product: CachedProduct, quantity?: number) => { ok: boolean; reason?: string };
  setQuantity: (productId: string, quantity: number) => void;
  removeLine: (productId: string) => void;
  setLineDiscount: (productId: string, amount: string) => void;
  setCustomer: (id: string | null, name: string) => void;
  setDiscount: (type: 'NONE' | 'AMOUNT' | 'PERCENT', value: string) => void;
  setNote: (note: string) => void;
  clear: () => void;

  hold: () => void;
  retrieve: (id: string) => void;
  discardHeld: (id: string) => void;
  /** Read suspended sales back off disk — called when the till opens. */
  loadHeld: () => Promise<void>;

  subtotal: () => number;
  discountAmount: () => number;
  total: () => number;
  itemCount: () => number;
}

const WALK_IN = 'Walk-in Customer';

/**
 * Cart arithmetic here is for *display only*. The authoritative totals are
 * computed server-side in DECIMAL; the server rejects a sale whose payment
 * does not match its own computed total, so a float rounding difference
 * surfaces as a clear error rather than a mispriced sale.
 */
export const useCart = create<CartState>((set, get) => ({
  lines: [],
  customerId: null,
  customerName: WALK_IN,
  discountType: 'NONE',
  discountValue: '0',
  note: '',
  held: [],

  addProduct: (product, quantity = 1) => {
    if (!product.isActive) return { ok: false, reason: `${product.name} is not available.` };

    // Expired stock can never be sold (§51.3). Checked here too so the
    // block is immediate and works offline, not only at the server.
    if (product.tracksExpiry && product.earliestExpiry) {
      const expiry = new Date(product.earliestExpiry);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiry < today) {
        return { ok: false, reason: `${product.name} has expired and cannot be sold.` };
      }
    }

    const existing = get().lines.find((l) => l.productId === product.id);
    const nextQty = (existing?.quantity ?? 0) + quantity;

    if (nextQty > product.stock) {
      return {
        ok: false,
        reason: `Only ${product.stock} of ${product.name} in stock.`,
      };
    }

    if (existing) {
      set({
        lines: get().lines.map((l) =>
          l.productId === product.id ? { ...l, quantity: nextQty } : l,
        ),
      });
    } else {
      set({
        lines: [
          ...get().lines,
          {
            productId: product.id,
            // Sizes share a name, so a line reading only "Vaseline Cocoa Radiant"
        // would not say which one is being sold — on screen or on the receipt.
        name: product.variantName ? `${product.name} — ${product.variantName}` : product.name,
            sku: product.sku,
            unitPrice: product.sellingPrice,
            quantity,
            discountAmount: '0',
            stock: product.stock,
            tracksExpiry: product.tracksExpiry,
            earliestExpiry: product.earliestExpiry,
          },
        ],
      });
    }

    return { ok: true };
  },

  setQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeLine(productId);
      return;
    }
    set({
      lines: get().lines.map((l) =>
        l.productId === productId ? { ...l, quantity: Math.min(quantity, l.stock) } : l,
      ),
    });
  },

  removeLine: (productId) =>
    set({ lines: get().lines.filter((l) => l.productId !== productId) }),

  setLineDiscount: (productId, amount) =>
    set({
      lines: get().lines.map((l) =>
        l.productId === productId ? { ...l, discountAmount: amount } : l,
      ),
    }),

  setCustomer: (id, name) => set({ customerId: id, customerName: name || WALK_IN }),
  setDiscount: (discountType, discountValue) => set({ discountType, discountValue }),
  setNote: (note) => set({ note }),

  clear: () =>
    set({
      lines: [],
      customerId: null,
      customerName: WALK_IN,
      discountType: 'NONE',
      discountValue: '0',
      note: '',
    }),

  /**
   * Suspend the current sale.
   *
   * Written to disk immediately. Holding is a promise to the customer
   * that the basket will still be there — one that a sign-out, a reload
   * or a PWA restart must not break.
   */
  hold: () => {
    const { lines, customerId, customerName, note, held } = get();
    if (lines.length === 0) return;

    const transaction: HeldTransaction = {
      id: crypto.randomUUID(),
      heldAt: new Date().toISOString(),
      lines,
      customerId,
      customerName,
      note,
    };

    set({ held: [...held, transaction] });
    void saveHeldTransaction(transaction).catch(() => undefined);
    get().clear();
  },

  retrieve: (id) => {
    const transaction = get().held.find((h) => h.id === id);
    if (!transaction) return;

    set({
      lines: transaction.lines,
      customerId: transaction.customerId,
      customerName: transaction.customerName,
      note: transaction.note,
      held: get().held.filter((h) => h.id !== id),
    });
    void removeHeldTransaction(id).catch(() => undefined);
  },

  discardHeld: (id) => {
    set({ held: get().held.filter((h) => h.id !== id) });
    void removeHeldTransaction(id).catch(() => undefined);
  },

  loadHeld: async () => {
    const stored = await getHeldTransactions();
    set({ held: stored as HeldTransaction[] });
  },

  subtotal: () =>
    get().lines.reduce(
      (sum, l) =>
        sum + Number.parseFloat(l.unitPrice) * l.quantity - Number.parseFloat(l.discountAmount || '0'),
      0,
    ),

  discountAmount: () => {
    const { discountType, discountValue } = get();
    const subtotal = get().subtotal();
    const value = Number.parseFloat(discountValue || '0');
    if (Number.isNaN(value) || value <= 0) return 0;
    if (discountType === 'AMOUNT') return Math.min(value, subtotal);
    if (discountType === 'PERCENT') return (subtotal * Math.min(value, 100)) / 100;
    return 0;
  },

  total: () => Math.max(0, get().subtotal() - get().discountAmount()),
  itemCount: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
}));
