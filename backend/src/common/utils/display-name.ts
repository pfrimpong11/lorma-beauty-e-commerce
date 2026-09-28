/**
 * What a product is called once sizes exist.
 *
 * A size shares its article's name, so "Vaseline Cocoa Radiant" alone would
 * not say which one was sold. Receipts, movements and reports all need the
 * size, and they all denormalise the name into a VarChar(200) column, so
 * the result is clipped rather than allowed to overflow it.
 */
export function displayName(product: { name: string; variantName?: string | null }): string {
  const label = product.variantName?.trim();
  const full = label ? `${product.name} — ${label}` : product.name;
  return full.length > 200 ? full.slice(0, 200) : full;
}
