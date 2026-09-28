export interface NavItem {
  label: string;
  href: string;
  /** Any one of these permissions makes the item visible (§41). */
  permissions: string[];
  icon: string;
  children?: NavItem[];
}

/** Icon paths are inline SVG `d` attributes, keyed by name. */
export const ICONS: Record<string, string> = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  pos: 'M2 7h20l-1.5 12.5a2 2 0 0 1-2 1.5H5.5a2 2 0 0 1-2-1.5L2 7Zm6 0V5a4 4 0 0 1 8 0v2',
  sales: 'M3 3v18h18M7 14l4-4 3 3 5-6',
  products: 'M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  customers: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  staff: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 1v6m3-3h-6',
  shifts: 'M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  reports: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z',
  sync: 'M21 12a9 9 0 0 1-9 9 9 9 0 0 1-8-4.9M3 12a9 9 0 0 1 9-9 9 9 0 0 1 8 4.9M21 3v6h-6M3 21v-6h6',
  audit: 'M9 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-4m-6 0V7a3 3 0 0 1 6 0v4m-6 0h6',
  inventory: 'M3 9h18M3 15h18M9 3v18M15 3v18',
  expiry: 'M8 2v4m8-4v4M3 10h18M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm7 8v3',
  returns: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4',
  receipt: 'M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2-3 2Zm4 6h8M8 12h8M8 16h5',
  backoffice: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01',
  scanner: 'M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8m4-8v8m4-8v8m3-8v8',
  stockcount: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  movements: 'M4 17h16M4 17l4-4m-4 4 4 4M20 7H4m16 0-4-4m4 4-4 4',
};

/**
 * The application is split into two sections with separate shells:
 *
 *   TILL  — the selling app. Full screen, no admin chrome, built around
 *           the counter: ring up a sale, manage your own shift, see what
 *           is still queued offline.
 *   ADMIN — the back office. Sidebar, tables, reports, administration.
 *
 * A cashier only ever sees the till. Anyone holding a back-office
 * permission gets a switcher between the two.
 */

export const TILL_NAV: NavItem[] = [
  { label: 'Sell', href: '/till', permissions: ['pos.access'], icon: 'pos' },
  { label: 'My Shift', href: '/till/shift', permissions: ['shift.open'], icon: 'shifts' },
  { label: 'Receipts', href: '/till/receipts', permissions: ['sale.view'], icon: 'receipt' },
  { label: 'Sync', href: '/till/sync', permissions: ['sale.view'], icon: 'sync' },
];

export const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', permissions: ['dashboard.view'], icon: 'dashboard' },
  {
    label: 'Sales',
    href: '/admin/sales',
    permissions: ['sale.view_all'],
    icon: 'sales',
    children: [
      { label: 'All Sales', href: '/admin/sales', permissions: ['sale.view_all'], icon: 'sales' },
      { label: 'Returns', href: '/admin/returns', permissions: ['return.create'], icon: 'returns' },
    ],
  },
  {
    label: 'Products',
    href: '/admin/products',
    permissions: ['product.view'],
    icon: 'products',
    children: [
      { label: 'Products', href: '/admin/products', permissions: ['product.view'], icon: 'products' },
      { label: 'Categories', href: '/admin/categories', permissions: ['category.view'], icon: 'products' },
      { label: 'Inventory', href: '/admin/inventory', permissions: ['inventory.view'], icon: 'inventory' },
      { label: 'Stock Counts', href: '/admin/inventory/counts', permissions: ['inventory.view'], icon: 'stockcount' },
      { label: 'Movements', href: '/admin/inventory/movements', permissions: ['inventory.view'], icon: 'movements' },
      { label: 'Expiry', href: '/admin/expiry', permissions: ['inventory.view'], icon: 'expiry' },
    ],
  },
  { label: 'Customers', href: '/admin/customers', permissions: ['customer.view'], icon: 'customers' },
  { label: 'Staff', href: '/admin/staff', permissions: ['user.view'], icon: 'staff' },
  { label: 'Shifts', href: '/admin/shifts', permissions: ['shift.view_all'], icon: 'shifts' },
  { label: 'Reports', href: '/admin/reports', permissions: ['report.view'], icon: 'reports' },
  { label: 'Audit Log', href: '/admin/audit', permissions: ['audit.view'], icon: 'audit' },
  { label: 'Devices', href: '/admin/devices', permissions: ['settings.manage'], icon: 'scanner' },
];

/**
 * Permissions that grant the back office at all. A cashier holds none of
 * these, so no switcher is shown and /admin is closed to them.
 */
export const BACK_OFFICE_PERMISSIONS = [
  'dashboard.view',
  'product.update',
  'product.create',
  'category.manage',
  'inventory.adjust',
  'inventory.stock_in',
  'user.view',
  'report.view',
  'audit.view',
  'shift.view_all',
  'return.create',
];

/** Where a user should land after signing in. */
export function landingPath(permissions: string[]): string {
  if (permissions.includes('dashboard.view')) return '/admin/dashboard';
  if (permissions.includes('pos.access')) return '/till';
  const firstAdmin = ADMIN_NAV.find((item) => item.permissions.some((p) => permissions.includes(p)));
  return firstAdmin?.href ?? '/till';
}

export function canUseBackOffice(permissions: string[]): boolean {
  return BACK_OFFICE_PERMISSIONS.some((p) => permissions.includes(p));
}

export function canUseTill(permissions: string[]): boolean {
  return permissions.includes('pos.access');
}

/**
 * Navigation for a given user.
 *
 * Section membership is checked before item permissions, so holding a
 * read permission a cashier also has (product.view, customer.view) can
 * never surface a back-office item. The shells redirect too, but this
 * makes the invariant hold in the data rather than relying on it.
 */
function itemsFor(items: NavItem[], permissions: string[]): NavItem[] {
  return items
    .filter((item) => item.permissions.some((p) => permissions.includes(p)))
    .map((item) => ({
      ...item,
      children: item.children ? itemsFor(item.children, permissions) : undefined,
    }));
}

export function adminNavFor(permissions: string[]): NavItem[] {
  if (!canUseBackOffice(permissions)) return [];
  return itemsFor(ADMIN_NAV, permissions);
}

export function tillNavFor(permissions: string[]): NavItem[] {
  if (!canUseTill(permissions)) return [];
  return itemsFor(TILL_NAV, permissions);
}
