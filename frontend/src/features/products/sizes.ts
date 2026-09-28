/**
 * The sizes a product can be sold in.
 *
 * One list, used by the add-product form and the size manager alike, so the
 * two can never offer different options for the same field.
 *
 * Grouped rather than flat because a skincare range mixes three kinds of
 * size — a garment-style label, a volume and a weight — and a single
 * alphabetical list of thirty entries is slower to use than three short
 * ones. The stored value is the label itself, which keeps the data
 * readable on a receipt and lets this list grow without a migration.
 */
export interface SizeGroup {
  label: string;
  options: string[];
}

export const SIZE_GROUPS: SizeGroup[] = [
  {
    label: 'Standard',
    options: ['Small', 'Medium', 'Large', 'Extra Large', 'XXL'],
  },
  {
    label: 'Volume',
    options: ['30ml', '50ml', '75ml', '100ml', '150ml', '200ml', '250ml', '400ml', '500ml', '1L'],
  },
  {
    label: 'Weight',
    options: ['25g', '50g', '100g', '150g', '200g', '250g', '500g', '1kg'],
  },
];

/** Flat list, for validating a value that arrived from somewhere else. */
export const ALL_SIZES: string[] = SIZE_GROUPS.flatMap((g) => g.options);

/**
 * Sizes still available in a group.
 *
 * A label already used is not offered again: two "Large" rows would be
 * indistinguishable on the till, and the server rejects them anyway.
 */
export function availableSizes(taken: Array<string | null | undefined>): SizeGroup[] {
  const used = new Set(taken.filter(Boolean).map((t) => t!.toLowerCase()));
  return SIZE_GROUPS.map((g) => ({
    label: g.label,
    options: g.options.filter((o) => !used.has(o.toLowerCase())),
  })).filter((g) => g.options.length > 0);
}
