import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Local persistence for offline operation (§22).
 *
 * IndexedDB rather than localStorage: the catalogue can run to thousands of
 * products, and — critically — a queued sale must survive a page refresh,
 * a browser restart and a device reboot (§53). localStorage is synchronous,
 * size-limited and string-only, which none of that tolerates.
 */

export type QueueStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'REJECTED';

/**
 * A suspended transaction.
 *
 * Holding a sale is an explicit promise to keep it, so it belongs on disk
 * next to the offline queue — not in memory, where signing out, reloading
 * or restarting the PWA would silently throw it away.
 */
export interface HeldTransaction {
  id: string;
  heldAt: string;
  customerId: string | null;
  customerName: string;
  note: string;
  lines: Array<{
    productId: string;
    name: string;
    sku: string;
    unitPrice: string;
    quantity: number;
    discountAmount: string;
    stock: number;
    tracksExpiry: boolean;
    earliestExpiry: string | null;
  }>;
}

export interface CachedProduct {
  id: string;
  name: string;
  sku: string;
  /** The primary code, for display. */
  barcode: string | null;
  /**
   * Every active code that resolves to this product.
   *
   * A product can carry several — a supplier reprints the code between
   * runs, or every unit is individually barcoded — so the offline lookup
   * has to match any of them, not just one.
   */
  barcodes: string[];
  brand: string | null;
  categoryId: string;
  category: string;
  sellingPrice: string;
  unit: string;
  imageUrl: string | null;
  stock: number;
  minStockLevel: number;
  tracksExpiry: boolean;
  /**
   * Sizes of one article share a group id. The till collapses a group into
   * a single tile and asks which size, which it does from this cached list
   * so it behaves the same with no connection.
   */
  variantGroupId: string | null;
  variantName: string | null;
  variantSort: number;
  isActive: boolean;
  earliestExpiry: string | null;
  updatedAt: string;
}

export interface CachedCategory {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CachedCustomer {
  id: string;
  name: string;
  phone: string | null;
  isWalkIn: boolean;
}

export interface QueuedSaleItem {
  productId: string;
  quantity: number;
  discountAmount?: string;
}

export interface QueuedPayment {
  method: string;
  amount: string;
  amountTendered?: string;
  reference?: string;
}

export interface QueuedSale {
  /** Primary key. Generated once, reused on every retry — never regenerated. */
  clientUuid: string;
  idempotencyKey: string;
  deviceId: string;
  clientSequence: number;
  clientTime: string;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  /** Denormalised for the offline receipt and the queue list. */
  receiptPreview: {
    total: string;
    itemCount: number;
    customerName: string;
    lines: Array<{ name: string; quantity: number; lineTotal: string }>;
  };
  sale: {
    items: QueuedSaleItem[];
    payments: QueuedPayment[];
    customerId?: string;
    discountType?: string;
    discountValue?: string;
    note?: string;
    soldAt: string;
  };
}

interface LormaDB extends DBSchema {
  products: { key: string; value: CachedProduct; indexes: { 'by-barcode': string } };
  categories: { key: string; value: CachedCategory };
  customers: { key: string; value: CachedCustomer };
  queue: { key: string; value: QueuedSale; indexes: { 'by-status': QueueStatus; 'by-seq': number } };
  held: { key: string; value: HeldTransaction };
  meta: { key: string; value: unknown };
}

const DB_NAME = 'lorma-beauty-pos';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<LormaDB>> | null = null;

function db(): Promise<IDBPDatabase<LormaDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available on the server'));
  }
  dbPromise ??= openDB<LormaDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const products = database.createObjectStore('products', { keyPath: 'id' });
        // Barcode lookup is the scanner's hot path and must not scan the store.
        products.createIndex('by-barcode', 'barcodes', { multiEntry: true });

        database.createObjectStore('categories', { keyPath: 'id' });
        database.createObjectStore('customers', { keyPath: 'id' });

        const queue = database.createObjectStore('queue', { keyPath: 'clientUuid' });
        queue.createIndex('by-status', 'status');
        queue.createIndex('by-seq', 'clientSequence');

        database.createObjectStore('meta');
      }

      if (oldVersion === 1) {
        // v1 indexed a single `barcode` string. Products can now carry
        // several codes, so the index becomes multiEntry over an array —
        // which means replacing it and clearing the cached catalogue so
        // the next sync repopulates it in the new shape. The offline
        // QUEUE is deliberately untouched: unsynced sales must survive
        // an upgrade (§51.9).
        const products = transaction.objectStore('products');
        if (products.indexNames.contains('by-barcode')) {
          products.deleteIndex('by-barcode');
        }
        products.createIndex('by-barcode', 'barcodes', { multiEntry: true });
        products.clear();
        transaction.objectStore('meta').delete('lastPullAt');
      }

      if (oldVersion < 3) {
        // Held transactions used to live only in memory, so every sign-out
        // and every reload discarded them.
        database.createObjectStore('held', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

// --- catalogue cache -------------------------------------------------------

export async function cacheCatalogue(data: {
  products: CachedProduct[];
  categories: CachedCategory[];
  customers: CachedCustomer[];
  serverTime: string;
}): Promise<void> {
  const database = await db();
  const tx = database.transaction(['products', 'categories', 'customers', 'meta'], 'readwrite');

  await Promise.all([
    ...data.products.map((p) => tx.objectStore('products').put(p)),
    ...data.categories.map((c) => tx.objectStore('categories').put(c)),
    ...data.customers.map((c) => tx.objectStore('customers').put(c)),
    tx.objectStore('meta').put(data.serverTime, 'lastPullAt'),
  ]);

  await tx.done;
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  const all = await (await db()).getAll('products');
  return all.filter((p) => p.isActive).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The forms of a barcode that mean the same product.
 *
 * A UPC-A code is 12 digits on the packaging, but most scanners — the
 * FR20 included — transmit it expanded to EAN-13 with a leading zero.
 * Registering one form and scanning the other must not miss.
 *
 * Mirrors the server's rule in backend/src/products/barcodes.service.ts,
 * so a scan behaves identically online and offline.
 */
export function equivalentBarcodes(code: string): string[] {
  const trimmed = code.trim();
  const candidates = [trimmed];

  if (/^\d{13}$/.test(trimmed) && trimmed.startsWith('0')) {
    candidates.push(trimmed.slice(1));
  } else if (/^\d{12}$/.test(trimmed)) {
    candidates.push(`0${trimmed}`);
  }

  return candidates;
}

export async function findCachedByBarcode(barcode: string): Promise<CachedProduct | undefined> {
  const database = await db();

  // A multiEntry index matches on any element of the `barcodes` array, so
  // one lookup covers every code the product carries.
  for (const candidate of equivalentBarcodes(barcode)) {
    const match = await database.getFromIndex('products', 'by-barcode', candidate);
    if (match?.isActive) return match;
  }

  return undefined;
}

export async function getCachedCategories(): Promise<CachedCategory[]> {
  const all = await (await db()).getAll('categories');
  return all.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getCachedCustomers(): Promise<CachedCustomer[]> {
  return (await db()).getAll('customers');
}

/**
 * Adjust the cached stock figure after an offline sale, so a cashier
 * selling the same item repeatedly while offline sees it run down rather
 * than appearing infinitely available.
 */
export async function decrementCachedStock(
  items: Array<{ productId: string; quantity: number }>,
): Promise<void> {
  const database = await db();
  const tx = database.transaction('products', 'readwrite');
  for (const item of items) {
    const product = await tx.store.get(item.productId);
    if (product) {
      await tx.store.put({ ...product, stock: Math.max(0, product.stock - item.quantity) });
    }
  }
  await tx.done;
}

// --- offline queue ---------------------------------------------------------

export async function enqueueSale(sale: QueuedSale): Promise<void> {
  await (await db()).put('queue', sale);
}

export async function getQueue(status?: QueueStatus): Promise<QueuedSale[]> {
  const database = await db();
  const all = status
    ? await database.getAllFromIndex('queue', 'by-status', status)
    : await database.getAll('queue');
  return all.sort((a, b) => a.clientSequence - b.clientSequence);
}

export async function updateQueueEntry(
  clientUuid: string,
  patch: Partial<QueuedSale>,
): Promise<void> {
  const database = await db();
  const existing = await database.get('queue', clientUuid);
  if (existing) await database.put('queue', { ...existing, ...patch });
}

export async function removeFromQueue(clientUuid: string): Promise<void> {
  await (await db()).delete('queue', clientUuid);
}

export async function queueCounts(): Promise<Record<QueueStatus, number>> {
  const all = await getQueue();
  const counts: Record<QueueStatus, number> = {
    PENDING: 0,
    SYNCING: 0,
    SYNCED: 0,
    CONFLICT: 0,
    REJECTED: 0,
  };
  for (const entry of all) counts[entry.status] += 1;
  return counts;
}

// --- held transactions -----------------------------------------------------

export async function getHeldTransactions(): Promise<HeldTransaction[]> {
  try {
    const all = await (await db()).getAll('held');
    // Oldest first: the customer who stepped aside earliest is usually
    // the one coming back next.
    return all.sort((a, b) => a.heldAt.localeCompare(b.heldAt));
  } catch {
    return [];
  }
}

export async function saveHeldTransaction(held: HeldTransaction): Promise<void> {
  await (await db()).put('held', held);
}

export async function removeHeldTransaction(id: string): Promise<void> {
  await (await db()).delete('held', id);
}

// --- meta ------------------------------------------------------------------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key) as Promise<T | undefined>;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

/**
 * A stable per-device identifier. Offline sales are attributed to it, and
 * it must survive reloads — so it lives in IndexedDB, not memory.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await getMeta<string>('deviceId');
  if (existing) return existing;
  const generated = `till-${crypto.randomUUID().slice(0, 8)}`;
  await setMeta('deviceId', generated);
  return generated;
}

/** Monotonic per-device counter that preserves the order sales were made. */
export async function nextSequence(): Promise<number> {
  const current = (await getMeta<number>('sequence')) ?? 0;
  const next = current + 1;
  await setMeta('sequence', next);
  return next;
}

export async function clearLocalData(): Promise<void> {
  const database = await db();
  const tx = database.transaction(['products', 'categories', 'customers', 'meta'], 'readwrite');
  // Neither the queue nor held transactions are cleared: unsynced sales
  // (§51.9) and suspended sales are promises to the customer, and a
  // sign-out is not permission to break them.
  await Promise.all([
    tx.objectStore('products').clear(),
    tx.objectStore('categories').clear(),
    tx.objectStore('customers').clear(),
    tx.objectStore('meta').delete('lastPullAt'),
  ]);
  await tx.done;
}
