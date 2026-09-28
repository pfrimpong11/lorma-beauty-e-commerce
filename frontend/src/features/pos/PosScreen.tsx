'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { api, ApiError } from '@/lib/api';
import {
  decrementCachedStock,
  enqueueSale,
  getCachedCategories,
  getCachedCustomers,
  getCachedProducts,
  getDeviceId,
  nextSequence,
  type CachedCategory,
  type CachedCustomer,
  type CachedProduct,
} from '@/lib/db';
import { pullCatalogue } from '@/lib/sync';
import { useOnline } from '@/hooks/useOnline';
import { getConfig } from '@/lib/runtime-config';
import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/store/auth';
import { useCart } from '@/store/cart';
import { toast } from '@/store/toast';
import { Receipt, type ReceiptData } from './Receipt';
import { ReceiptPrintHost } from '@/features/pos/ReceiptPrintHost';
import { PaymentModal, type PaymentResult } from './PaymentModal';
import { usePosShortcuts } from './useBarcodeScanner';
import { useScanner } from '@/hooks/useScanner';
import { findProductByBarcode } from './findProductByBarcode';
import { printReceipt, shouldAutoPrint } from '@/lib/printer/print';
import type { ScanEvent } from '@/lib/scanner/types';

type ScanOutcome =
  | { status: 'added'; product: CachedProduct }
  | { status: 'rejected' }
  | { status: 'not-found' };

/** Ghanaian mobile prefixes; the server holds the same list. */
const GH_PREFIXES = ['20', '23', '24', '25', '26', '27', '28', '29', '50', '53', '54', '55', '56', '57', '59'];

export function PosScreen() {
  const { apiUrl } = getConfig();
  const online = useOnline(`${apiUrl}/health/live`);
  const user = useAuth((s) => s.user);
  const cart = useCart();

  const [products, setProducts] = useState<CachedProduct[]>([]);
  const [categories, setCategories] = useState<CachedCategory[]>([]);
  const [customers, setCustomers] = useState<CachedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  /** Mobile only: the cart is a bottom sheet rather than a column. */
  const [cartOpen, setCartOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ---- catalogue ---------------------------------------------------------

  const loadFromCache = useCallback(async () => {
    const [p, c, cu] = await Promise.all([
      getCachedProducts(),
      getCachedCategories(),
      getCachedCustomers(),
    ]);
    setProducts(p);
    setCategories(c);
    setCustomers(cu);
    setLoading(false);
    return p.length;
  }, []);

  // Suspended sales live on disk, so pick them up when the till opens.
  useEffect(() => {
    void cart.loadHeld();
    // Once per mount: re-running would overwrite a hold made this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const cached = await loadFromCache();

      // Refresh in the background when online. An empty cache on a fresh
      // device is the one case where we must wait for the network.
      if (online) {
        try {
          await pullCatalogue(cached === 0);
          if (!cancelled) await loadFromCache();
        } catch {
          if (!cancelled && cached === 0) {
            toast.error('Could not load products.', 'Connect to the internet and try again.');
          }
        }
      } else if (cached === 0) {
        toast.warning('No cached products on this device.', 'Connect once to download the catalogue.');
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
    // Re-running on reconnect refreshes prices and stock.
  }, [online, loadFromCache]);

  // §4 — search is debounced so a fast typist does not re-filter per key.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim().toLowerCase()), 180);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => {
    let list = products;
    if (categoryId) list = list.filter((p) => p.categoryId === categoryId);
    if (debounced) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(debounced) ||
          p.sku.toLowerCase().includes(debounced) ||
          (p.brand?.toLowerCase().includes(debounced) ?? false) ||
          p.barcode === debounced,
      );
    }
    // Capped so a 5,000-product catalogue cannot put 5,000 nodes in the DOM (§42).
    return list.slice(0, 120);
  }, [products, categoryId, debounced]);

  /*
   * One tile per article, not per size.
   *
   * Sizes share a name, so listing them separately fills the grid with rows
   * that differ by a word and makes the cashier read every one. A group
   * becomes a single tile that asks which size on tap. Grouping happens
   * here, over the cached catalogue, so it behaves identically offline.
   */
  const tiles = useMemo(() => {
    const out: Array<
      | { kind: 'product'; key: string; product: CachedProduct }
      | { kind: 'group'; key: string; name: string; sizes: CachedProduct[] }
    > = [];
    const groups = new Map<string, CachedProduct[]>();

    for (const p of filtered) {
      if (!p.variantGroupId) {
        out.push({ kind: 'product', key: p.id, product: p });
        continue;
      }
      const existing = groups.get(p.variantGroupId);
      if (existing) {
        existing.push(p);
      } else {
        const sizes = [p];
        groups.set(p.variantGroupId, sizes);
        // Pushed at the position of its first size, so grouping does not
        // reorder the grid under the cashier.
        out.push({ kind: 'group', key: p.variantGroupId, name: p.name, sizes });
      }
    }

    for (const sizes of groups.values()) {
      sizes.sort((a, b) => a.variantSort - b.variantSort);
    }

    // A group the search narrowed to one size is not a choice worth making.
    return out.map((tile) =>
      tile.kind === 'group' && tile.sizes.length === 1
        ? ({ kind: 'product', key: tile.sizes[0].id, product: tile.sizes[0] } as const)
        : tile,
    );
  }, [filtered]);

  const [choosingSize, setChoosingSize] = useState<{ name: string; sizes: CachedProduct[] } | null>(
    null,
  );

  /*
   * Payment is settled, then the number is asked for, then the sale posts.
   * Holding the payment here rather than posting straight away is what lets
   * the number ride along on the same request — including a queued offline
   * one, which must not depend on a second call that could be lost.
   */
  const [pendingPayment, setPendingPayment] = useState<PaymentResult | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // ---- adding to the cart -------------------------------------------------

  const addProduct = useCallback(
    (product: CachedProduct): boolean => {
      // The single place a product enters the cart, whichever way it was
      // chosen. Stock and expiry rules live in the cart, not here (§11).
      const result = cart.addProduct(product);
      if (!result.ok) {
        toast.warning(result.reason ?? 'That product cannot be added.');
        return false;
      }
      if (product.stock <= product.minStockLevel && product.stock > 0) {
        toast.warning(`Only ${product.stock} units remaining.`);
      }
      return true;
    },
    [cart],
  );

  /**
   * Scan -> product -> existing cart. Nothing else.
   *
   * `addProduct` is the same call the product grid makes, so quantity
   * increments, stock limits and expiry rules behave identically however
   * the product was chosen (§9, §11, §12).
   */
  const onScan = useCallback(
    async (barcode: string): Promise<ScanOutcome> => {
      setResolving(true);
      try {
        const match = await findProductByBarcode(barcode);
        if (!match) return { status: 'not-found' };
        // Rejections (out of stock, expired) are already reported by
        // addProduct using the POS's existing messages.
        return addProduct(match)
          ? { status: 'added', product: match }
          : { status: 'rejected' };
      } finally {
        setResolving(false);
      }
    },
    [addProduct],
  );

  /**
   * Enter in the search box tries a barcode first, then falls back to
   * leaving the text as an ordinary search (§14).
   *
   * Silence matters here: pressing Enter after typing "vitamin" must not
   * announce "product not found", because that was a search, not a scan.
   * Only a plausible barcode — digits, long enough — earns a complaint.
   */
  const onSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;
      const query = search.trim();
      if (!query) return;

      event.preventDefault();

      void onScan(query).then((outcome) => {
        if (outcome.status !== 'not-found') {
          setSearch('');
          return;
        }
        if (/^\d{4,}$/.test(query)) {
          toast.error('Product not found', `No product matches ${query}.`);
        }
      });
    },
    [search, onScan],
  );

  // Always listening while the cashier isselecting products — no button
  // to press, no modal to open (§6). Suspended only during payment: a
  // stray read must not alter a cart money is already being taken for.
  useScanner(
    useCallback(
      (event: ScanEvent) => {
        void onScan(event.code).then((outcome) => {
          if (outcome.status === 'added') {
            toast.success(`${outcome.product.name} added.`);
          } else if (outcome.status === 'not-found') {
            // §10 — never a technical error, never a modal. The till stays
            // ready for the next scan.
            toast.error('Product not found', `No product matches ${event.code}.`);
          }
        });
      },
      [onScan],
    ),
    !paymentOpen,
  );

  usePosShortcuts({
    onSearch: () => searchRef.current?.focus(),
    onCustomer: () => setCustomerOpen(true),
    onHold: () => {
      if (cart.lines.length === 0) {
        toast.info('Nothing to hold.');
        return;
      }
      cart.hold();
      toast.success('Transaction held.');
    },
    onCheckout: () => {
      if (cart.lines.length > 0) setPaymentOpen(true);
    },
    onGlobalSearch: () => searchRef.current?.focus(),
  });

  // ---- completing the sale ------------------------------------------------


  /** Same rule as the server, so a typo is caught before the sale posts. */
  const validGhanaPhone = (input: string): boolean => {
    const digits = input.replace(/[^\d]/g, '');
    const national =
      digits.length === 10 && digits.startsWith('0')
        ? digits.slice(1)
        : digits.length === 12 && digits.startsWith('233')
          ? digits.slice(3)
          : digits.length === 9
            ? digits
            : null;

    if (national === null || national.length !== 9) return false;
    return GH_PREFIXES.includes(national.slice(0, 2));
  };

  const finishSale = async (withPhone: boolean) => {
    if (!pendingPayment) return;

    if (withPhone) {
      if (!validGhanaPhone(phone)) {
        setPhoneError('Enter a Ghanaian mobile number, such as 024 123 4567.');
        return;
      }
    }

    setPhoneOpen(false);
    const payment = pendingPayment;
    setPendingPayment(null);
    await completeSale(payment, withPhone ? phone.trim() : undefined);
  };

  const completeSale = async (payment: PaymentResult, customerPhone?: string) => {
    setSubmitting(true);

    const soldAt = new Date().toISOString();
    const clientUuid = crypto.randomUUID();
    const deviceId = await getDeviceId();
    const sequence = await nextSequence();

    const payload = {
      items: cart.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        ...(Number.parseFloat(l.discountAmount) > 0
          ? { discountAmount: Number.parseFloat(l.discountAmount).toFixed(2) }
          : {}),
      })),
      payments: [payment],
      ...(cart.customerId ? { customerId: cart.customerId } : {}),
      // The server looks the number up before creating anyone, so serving
      // the same person twice does not duplicate them.
      ...(customerPhone ? { customerPhone } : {}),
      ...(cart.discountType !== 'NONE'
        ? {
            discountType: cart.discountType,
            discountValue: Number.parseFloat(cart.discountValue || '0').toFixed(2),
          }
        : {}),
      ...(cart.note ? { note: cart.note } : {}),
      soldAt,
    };

    const lines = cart.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      lineTotal: (
        Number.parseFloat(l.unitPrice) * l.quantity - Number.parseFloat(l.discountAmount || '0')
      ).toFixed(2),
    }));

    /** Save locally and continue selling — never block the counter (§22). */
    const queueLocally = async (reason?: string) => {
      await enqueueSale({
        clientUuid,
        // Generated once and reused on every retry; regenerating it here
        // would defeat the server's idempotency guard (§51.11).
        idempotencyKey: `${deviceId}:${clientUuid}`,
        deviceId,
        clientSequence: sequence,
        clientTime: soldAt,
        status: 'PENDING',
        attempts: 0,
        lastError: reason ?? null,
        receiptPreview: {
          total: cart.total().toFixed(2),
          itemCount: cart.itemCount(),
          customerName: cart.customerName,
          lines,
        },
        sale: { ...payload, clientUuid: undefined } as never,
      });

      await decrementCachedStock(
        cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      );

      setReceipt({
        receiptNumber: 'PENDING SYNC',
        soldAt,
        cashierName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
        customerName: cart.customerName,
        items: lines.map((l) => ({
          productName: l.name,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
        })),
        subtotal: cart.subtotal().toFixed(2),
        discountAmount: cart.discountAmount().toFixed(2),
        total: cart.total().toFixed(2),
        payments: [payment],
        pendingSync: true,
      });

      cart.clear();
      setPaymentOpen(false);
      setCartOpen(false);
      await loadFromCache();
      toast.success('Transaction saved offline.', 'It will sync automatically when you reconnect.');
    };

    if (!online) {
      await queueLocally();
      setSubmitting(false);
      return;
    }

    try {
      const sale = await api.post<{
        receiptNumber: string;
        soldAt: string;
        subtotal: string;
        discountAmount: string;
        total: string;
        customer: { name: string } | null;
        cashier: { firstName: string; lastName: string };
        items: Array<{ productName: string; quantity: number; lineTotal: string }>;
        payments: Array<{ method: string; amount: string; amountTendered: string | null; changeGiven: string | null }>;
      }>(
        '/sales',
        { ...payload, clientUuid },
        // Sent even online: a timeout after the server committed would
        // otherwise be retried as a second sale.
        { idempotencyKey: `${deviceId}:${clientUuid}`, deviceId },
      );

      setReceipt({
        receiptNumber: sale.receiptNumber,
        soldAt: sale.soldAt,
        cashierName: `${sale.cashier.firstName} ${sale.cashier.lastName}`,
        customerName: sale.customer?.name ?? 'Walk-in Customer',
        items: sale.items,
        subtotal: sale.subtotal,
        discountAmount: sale.discountAmount,
        total: sale.total,
        payments: sale.payments,
      });

      cart.clear();
      setPaymentOpen(false);
      setCartOpen(false);
      toast.success('Sale completed successfully.', `Receipt ${sale.receiptNumber}`);

      void pullCatalogue().then(loadFromCache).catch(() => undefined);
    } catch (error) {
      if (error instanceof ApiError && error.isOffline) {
        // Connection dropped mid-sale: queue rather than lose it.
        await queueLocally('Connection lost during checkout');
      } else {
        const message =
          error instanceof ApiError
            ? error.message
            : 'Unable to complete the sale. Please try again.';
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Print automatically when a sale finishes, if the till is set up for
   * it. Waits for the receipt to be in the DOM — printing before it
   * renders produces a blank slip.
   *
   * A printer failure must never break the sale: the money is taken and
   * the sale is recorded either way, so this only ever warns.
   */
  useEffect(() => {
    if (!receipt) return;
    let cancelled = false;

    void shouldAutoPrint().then((enabled) => {
      if (!enabled || cancelled) return;
      void printReceipt().catch(() => {
        toast.warning('Could not print the receipt.', 'Use Print receipt to try again.');
      });
    });

    return () => {
      cancelled = true;
    };
  }, [receipt]);

  // ---- render -------------------------------------------------------------

  if (loading) return <LoadingState label="Loading products" />;

  return (
    <div className="flex h-app flex-col lg:flex-row">
      {/* Catalogue */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col lg:border-r lg:border-line">
        <div className="shrink-0 space-y-2 border-b border-line bg-surface-raised p-3 short:space-y-2 sm:p-4 tall:space-y-3">
          <div className="flex gap-2">
            <Input
              ref={searchRef}
              // Scan-ready the moment the till opens: the caret sits in
              // the search bar, so a scan or a typed code lands there
              // without the cashier clicking anything.
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search product or scan barcode…  (F2)"
              aria-label="Search products or enter a barcode"
              leading={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              }
              trailing={
                resolving ? (
                  <span
                    className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent"
                    aria-label="Looking up barcode"
                  />
                ) : search ? (
                  <button onClick={() => setSearch('')} aria-label="Clear search" className="hover:text-ink">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                ) : undefined
              }
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setCategoryId(null)}
              className={cn(
                'tap shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                'touch:px-4 touch:text-sm',
                !categoryId
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-line text-ink-muted hover:text-ink',
              )}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}
                className={cn(
                  'tap shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  'touch:px-4 touch:text-sm',
                  categoryId === c.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-line text-ink-muted hover:text-ink',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-4 lg:pb-4">
          {tiles.length === 0 ? (
            <EmptyState
              title={debounced ? 'No matching products' : 'No products available'}
              description={
                debounced
                  ? 'Try a different name, SKU or barcode.'
                  : 'Connect to the internet to download the catalogue.'
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {tiles.map((tile) => {
                if (tile.kind === 'group') {
                  const stock = tile.sizes.reduce((sum, v) => sum + v.stock, 0);
                  const prices = tile.sizes.map((v) => Number(v.sellingPrice));
                  const low = Math.min(...prices);
                  const high = Math.max(...prices);
                  const out = stock === 0;
                  return (
                    <motion.button
                      key={tile.key}
                      layout
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setChoosingSize({ name: tile.name, sizes: tile.sizes })}
                      disabled={out}
                      className={cn(
                        'flex flex-col rounded-xl border border-line bg-surface-raised p-3 text-left transition-colors',
                        out
                          ? 'cursor-not-allowed opacity-55'
                          : 'hover:border-brand-300 hover:shadow-card active:bg-brand-50',
                      )}
                    >
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-ink">
                        {tile.name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-subtle">
                        {tile.sizes.length} sizes
                      </p>
                      <div className="mt-auto flex items-end justify-between pt-2">
                        <span className="text-sm font-semibold tabular text-brand-700">
                          {low === high
                            ? formatAmount(String(low))
                            : `${formatAmount(String(low))}+`}
                        </span>
                        {out ? (
                          <Badge tone="danger">Out</Badge>
                        ) : (
                          <span className="text-xs tabular text-ink-subtle">{stock}</span>
                        )}
                      </div>
                    </motion.button>
                  );
                }

                const product = tile.product;
                const out = product.stock === 0;
                const low = !out && product.stock <= product.minStockLevel;
                return (
                  <motion.button
                    key={product.id}
                    layout
                    whileTap={{ scale: 0.97 }}
                    onClick={() => addProduct(product)}
                    disabled={out}
                    className={cn(
                      'flex flex-col rounded-xl border border-line bg-surface-raised p-3 text-left transition-colors',
                      out
                        ? 'cursor-not-allowed opacity-55'
                        : 'hover:border-brand-300 hover:shadow-card active:bg-brand-50',
                    )}
                  >
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-ink">
                      {product.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-subtle">{product.sku}</p>
                    <div className="mt-auto flex items-end justify-between pt-2">
                      <span className="text-sm font-semibold tabular text-brand-700">
                        {formatAmount(product.sellingPrice)}
                      </span>
                      {out ? (
                        <Badge tone="danger">Out</Badge>
                      ) : low ? (
                        <Badge tone="warning">{product.stock} left</Badge>
                      ) : (
                        <span className="text-xs tabular text-ink-subtle">{product.stock}</span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/*
        Mobile summary bar. On a phone the cart is a sheet, not a column —
        splitting a 700px screen in two left the catalogue unusable. This
        keeps the running total permanently visible and opens the cart on
        tap, which is how retail apps behave on small screens.
      */}
      <button
        onClick={() => setCartOpen(true)}
        aria-expanded={cartOpen}
        className="tap fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-surface-raised px-4 py-3 text-left shadow-raised lg:hidden"
      >
        <span className="min-w-0">
          <span className="block text-xs text-ink-subtle">
            {cart.itemCount() === 0
              ? 'Cart is empty'
              : `${cart.itemCount()} item${cart.itemCount() === 1 ? '' : 's'}`}
          </span>
          <span className="block text-lg font-semibold tabular text-brand-700">
            {formatAmount(cart.total().toFixed(2))}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white">
          View cart
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="m18 15-6-6-6 6" />
          </svg>
        </span>
      </button>

      {cartOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setCartOpen(false)}
          aria-hidden
        />
      )}

      {/* Cart */}
      <aside
        className={cn(
          'flex shrink-0 flex-col bg-surface-raised',
          // Phone/tablet: a sheet that slides up over the catalogue.
          'fixed inset-x-0 bottom-0 z-50 max-h-sheet rounded-t-2xl shadow-raised',
          'transition-transform duration-200 motion-reduce:transition-none',
          cartOpen ? 'translate-y-0' : 'translate-y-full',
          // Desktop and POS terminal: back to a static column.
          'lg:static lg:z-auto lg:max-h-none lg:w-[380px] lg:translate-y-0',
          'lg:rounded-none lg:shadow-none xl:w-[420px]',
        )}
      >
        {/* Sheet handle — mobile only */}
        <button
          onClick={() => setCartOpen(false)}
          aria-label="Close cart"
          className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line lg:hidden"
        />
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <button
            onClick={() => setCustomerOpen(true)}
            className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-sunken"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{cart.customerName}</span>
              <span className="block text-[10px] text-ink-subtle">Change customer · F4</span>
            </span>
          </button>

          {cart.held.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setHeldOpen(true)}>
              Held ({cart.held.length})
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.lines.length === 0 ? (
            <EmptyState
              title="Cart is empty"
              description="Scan a barcode or tap a product to begin."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2 7h20l-1.5 12.5a2 2 0 0 1-2 1.5H5.5a2 2 0 0 1-2-1.5L2 7Z" />
                </svg>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {cart.lines.map((line) => (
                  <motion.li
                    key={line.productId}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.16 }}
                    className="px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                        <p className="text-xs text-ink-subtle">
                          {formatAmount(line.unitPrice)} each
                        </p>
                      </div>
                      <button
                        onClick={() => cart.removeLine(line.productId)}
                        aria-label={`Remove ${line.name}`}
                        className="rounded p-1 text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-lg border border-line">
                        <button
                          onClick={() => cart.setQuantity(line.productId, line.quantity - 1)}
                          aria-label="Decrease quantity"
                          className="tap px-2.5 py-1.5 text-base text-ink-muted transition-colors hover:bg-surface-sunken touch:px-4"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={line.stock}
                          value={line.quantity}
                          onChange={(e) =>
                            cart.setQuantity(line.productId, Number.parseInt(e.target.value, 10) || 1)
                          }
                          aria-label={`Quantity for ${line.name}`}
                          className="w-12 border-x border-line bg-transparent py-1.5 text-center text-sm tabular text-ink [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => cart.setQuantity(line.productId, line.quantity + 1)}
                          disabled={line.quantity >= line.stock}
                          aria-label="Increase quantity"
                          className="tap px-2.5 py-1.5 text-base text-ink-muted transition-colors hover:bg-surface-sunken disabled:opacity-40 touch:px-4"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-sm font-semibold tabular text-ink">
                        {formatAmount(
                          (
                            Number.parseFloat(line.unitPrice) * line.quantity -
                            Number.parseFloat(line.discountAmount || '0')
                          ).toFixed(2),
                        )}
                      </span>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-line p-4 short:p-3">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-muted">
              <span>Subtotal</span>
              <span className="tabular">{formatAmount(cart.subtotal().toFixed(2))}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">Discount</span>
              <div className="flex items-center gap-1">
                <select
                  value={cart.discountType}
                  onChange={(e) =>
                    cart.setDiscount(e.target.value as 'NONE' | 'AMOUNT' | 'PERCENT', cart.discountValue)
                  }
                  aria-label="Discount type"
                  className="rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink"
                >
                  <option value="NONE">None</option>
                  <option value="AMOUNT">Amount</option>
                  <option value="PERCENT">%</option>
                </select>
                {cart.discountType !== 'NONE' && (
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cart.discountValue}
                    onChange={(e) => cart.setDiscount(cart.discountType, e.target.value)}
                    aria-label="Discount value"
                    className="w-20 rounded border border-line bg-surface px-2 py-1 text-right text-xs tabular text-ink"
                  />
                )}
                <span className="w-20 text-right tabular text-ink-muted">
                  −{formatAmount(cart.discountAmount().toFixed(2))}
                </span>
              </div>
            </div>

            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <span className="font-semibold text-ink">Total</span>
              <span className="text-2xl font-semibold tabular text-brand-700">
                {formatAmount(cart.total().toFixed(2))}
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                cart.hold();
                toast.success('Transaction held.');
              }}
              disabled={cart.lines.length === 0}
            >
              Hold · F8
            </Button>
            <Button
              variant="ghost"
              onClick={() => cart.clear()}
              disabled={cart.lines.length === 0}
              className="border border-line"
            >
              Clear
            </Button>
          </div>

          <Button
            size="xl"
            fullWidth
            // 64px is generous on a 768px-tall terminal; 56px still reads
            // as the primary action and buys back a product row.
            className="mt-2 short:h-14 short:text-base"
            onClick={() => setPaymentOpen(true)}
            disabled={cart.lines.length === 0}
          >
            Checkout · F9
          </Button>

          {!online && (
            <p className="mt-2 text-center text-xs font-medium text-warning">
              Offline — sales are saved on this device
            </p>
          )}
        </div>
      </aside>

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        total={cart.total()}
        onConfirm={(payment) => {
          // A named customer is already on file, so there is nothing to ask.
          if (cart.customerId) return completeSale(payment);
          setPendingPayment(payment);
          setPhone('');
          setPhoneError(null);
          setPaymentOpen(false);
          setPhoneOpen(true);
        }}
        submitting={submitting}
        offline={!online}
      />

      {/*
        The customer's number, asked for after payment is settled.
        Skippable on purpose: a customer who declines to give a number must
        not be able to stop the shop taking their money.
      */}
      <Modal
        open={phoneOpen}
        onClose={() => {
          // Closing is the same as skipping — the payment is already agreed
          // and abandoning the sale here would lose it.
          void finishSale(false);
        }}
        title="Customer's mobile number"
        description="We'll text them the receipt and save them to your customer list."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => void finishSale(false)} disabled={submitting}>
              Skip
            </Button>
            <Button size="lg" onClick={() => void finishSale(true)} loading={submitting}>
              Save &amp; finish
            </Button>
          </>
        }
      >
        <Input
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="024 123 4567"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (phoneError) setPhoneError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void finishSale(true);
            }
          }}
          error={phoneError ?? undefined}
          hint={phoneError ? undefined : 'Leave blank and press Skip if they would rather not.'}
          data-autofocus
        />
      </Modal>

      {/*
        Size chooser. Prices differ per size, so the price is on every
        button — picking by name alone would be picking blind. Out-of-stock
        sizes stay visible but disabled, because "we don't have the large"
        is an answer the cashier needs to give.
      */}
      <Modal
        open={choosingSize !== null}
        onClose={() => setChoosingSize(null)}
        title={choosingSize?.name ?? 'Choose a size'}
        description="Choose a size"
        size="md"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {(choosingSize?.sizes ?? []).map((size) => {
            const out = size.stock === 0;
            const low = !out && size.stock <= size.minStockLevel;
            return (
              <button
                key={size.id}
                disabled={out}
                onClick={() => {
                  if (addProduct(size)) setChoosingSize(null);
                }}
                className={cn(
                  'tap flex flex-col rounded-xl border p-3 text-left transition-colors',
                  out
                    ? 'cursor-not-allowed border-line opacity-55'
                    : 'border-line bg-surface-raised hover:border-brand-300 active:bg-brand-50',
                )}
              >
                <span className="text-sm font-medium text-ink">{size.variantName}</span>
                <span className="mt-1 text-base font-semibold tabular text-brand-700">
                  {formatAmount(size.sellingPrice)}
                </span>
                <span className="mt-auto pt-2 text-xs text-ink-subtle">
                  {out ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : low ? (
                    <Badge tone="warning">{size.stock} left</Badge>
                  ) : (
                    `${size.stock} in stock`
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Customer picker */}
      <Modal
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        title="Select customer"
        size="sm"
      >
        <ul className="-mx-2 max-h-80 space-y-0.5 overflow-y-auto">
          {customers.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => {
                  cart.setCustomer(c.isWalkIn ? null : c.id, c.name);
                  setCustomerOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken"
              >
                <span>
                  <span className="block text-sm font-medium text-ink">{c.name}</span>
                  {c.phone && <span className="block text-xs text-ink-subtle">{c.phone}</span>}
                </span>
                {c.isWalkIn && <Badge tone="brand">Default</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      {/* Held transactions */}
      <Modal open={heldOpen} onClose={() => setHeldOpen(false)} title="Held transactions" size="md">
        {cart.held.length === 0 ? (
          <EmptyState title="Nothing held" />
        ) : (
          <ul className="divide-y divide-line">
            {cart.held.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{h.customerName}</p>
                  <p className="text-xs text-ink-subtle">
                    {h.lines.length} item(s) · held {new Date(h.heldAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (cart.lines.length > 0) {
                        toast.warning('Clear or hold the current cart first.');
                        return;
                      }
                      cart.retrieve(h.id);
                      setHeldOpen(false);
                      toast.success('Transaction retrieved.');
                    }}
                  >
                    Retrieve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => cart.discardHeld(h.id)}>
                    Discard
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* The copy that reaches the paper — outside the dialog. */}
      <ReceiptPrintHost data={receipt} />

      {/* Receipt */}
      <Modal
        open={receipt !== null}
        onClose={() => setReceipt(null)}
        title={receipt?.pendingSync ? 'Sale saved offline' : 'Sale completed'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReceipt(null)}>
              Done
            </Button>
            <Button onClick={() => void printReceipt()} data-autofocus>
              Print receipt
            </Button>
          </>
        }
      >
        {receipt && (
          <div className="rounded-lg border border-line">
            <Receipt data={receipt} />
          </div>
        )}
      </Modal>
    </div>
  );
}
