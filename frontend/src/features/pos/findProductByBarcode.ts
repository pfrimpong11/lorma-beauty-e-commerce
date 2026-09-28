import { api } from '@/lib/api';
import { findCachedByBarcode, type CachedProduct } from '@/lib/db';

/**
 * Resolve a scanned barcode to the same product object the POS already
 * uses (§3). No separate product system, no duplicated pricing or stock
 * rules — this only answers "which product is this?".
 *
 * Cache first, then the existing API:
 *
 *   1. IndexedDB `by-barcode` index — an indexed local read, so the
 *      common case adds nothing perceptible to a scan and works offline.
 *   2. GET /products/barcode/:barcode — the endpoint the POS already
 *      exposes, for a product created since this device last synced.
 */
export async function findProductByBarcode(barcode: string): Promise<CachedProduct | null> {
  // Whitespace only. The value stays a string so leading zeros survive:
  // "0012345678905" must never become 12345678905 (§2).
  const code = barcode.trim();
  if (!code) return null;

  const cached = await findCachedByBarcode(code);
  if (cached) return cached;

  try {
    const result = await api.get<{
      found: boolean;
      product?: {
        id: string;
        name: string;
        sku: string;
        barcode: string | null;
        barcodes?: Array<{ barcode: string; isActive: boolean }>;
        brand: string | null;
        unit: string;
        imageUrl: string | null;
        category: { id: string; name: string };
        sellingPrice: string;
        stock: number;
        minStockLevel: number;
        tracksExpiry: boolean;
        variantGroupId: string | null;
        variantName: string | null;
        variantSort: number;
      };
    }>(`/products/barcode/${encodeURIComponent(code)}`);

    if (!result.found || !result.product) return null;

    const p = result.product;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      // Every active code, so a later offline lookup matches any of them.
      barcodes: (p.barcodes ?? []).filter((b) => b.isActive).map((b) => b.barcode),
      brand: p.brand,
      categoryId: p.category.id,
      category: p.category.name,
      sellingPrice: p.sellingPrice,
      unit: p.unit,
      imageUrl: p.imageUrl,
      stock: p.stock,
      minStockLevel: p.minStockLevel,
      tracksExpiry: p.tracksExpiry,
      // A scan names one size exactly, so it goes straight into the cart —
      // the size chooser is only for picking by hand.
      variantGroupId: p.variantGroupId ?? null,
      variantName: p.variantName ?? null,
      variantSort: p.variantSort ?? 0,
      // The endpoint filters to active products.
      isActive: true,
      // Not carried by this endpoint. The cart's client-side expiry check
      // is therefore skipped for a product this device has never synced;
      // the server still refuses to sell expired stock at checkout, so the
      // rule holds either way.
      earliestExpiry: null,
      updatedAt: new Date().toISOString(),
    } satisfies CachedProduct;
  } catch {
    // Offline, or the product genuinely is not there. Either way the
    // caller reports "not found" and the till stays ready for the next
    // scan — a lookup failure must never interrupt the queue.
    return null;
  }
}
