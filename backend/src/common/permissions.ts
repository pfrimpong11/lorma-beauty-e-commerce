/**
 * The permission catalogue.
 *
 * Authorization is permission-based rather than role-based at the check
 * site: guards ask "does this user hold product.update_price?", never "is
 * this user an admin?". Adding a role (Supervisor, Stock Controller) is
 * then a seed-data change, not a code change (PROMPT.md §6).
 */
export const PERMISSIONS = {
  // Dashboard & reporting
  DASHBOARD_VIEW: 'dashboard.view',
  REPORT_VIEW: 'report.view',
  REPORT_EXPORT: 'report.export',
  REPORT_VIEW_FINANCIAL: 'report.view_financial',

  // Catalogue
  PRODUCT_VIEW: 'product.view',
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_UPDATE_PRICE: 'product.update_price',
  PRODUCT_DEACTIVATE: 'product.deactivate',
  CATEGORY_VIEW: 'category.view',
  CATEGORY_MANAGE: 'category.manage',

  // Inventory
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_STOCK_IN: 'inventory.stock_in',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_WRITE_OFF: 'inventory.write_off',
  BATCH_MANAGE: 'batch.manage',

  // Selling
  POS_ACCESS: 'pos.access',
  SALE_VIEW: 'sale.view',
  SALE_VIEW_ALL: 'sale.view_all',
  SALE_CREATE: 'sale.create',
  SALE_DISCOUNT: 'sale.discount',
  SALE_DISCOUNT_UNLIMITED: 'sale.discount_unlimited',
  SALE_HOLD: 'sale.hold',
  SALE_VOID: 'sale.void',

  // Returns
  RETURN_VIEW: 'return.view',
  RETURN_CREATE: 'return.create',

  // Customers
  CUSTOMER_VIEW: 'customer.view',
  CUSTOMER_MANAGE: 'customer.manage',

  // People
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',

  // Shifts
  SHIFT_OPEN: 'shift.open',
  SHIFT_CLOSE_OWN: 'shift.close_own',
  SHIFT_CLOSE_ANY: 'shift.close_any',
  SHIFT_VIEW_ALL: 'shift.view_all',

  // Stock counts
  STOCKCOUNT_MANAGE: 'stockcount.manage',
  STOCKCOUNT_APPROVE: 'stockcount.approve',

  // Operations
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
  SYNC_RESOLVE_CONFLICT: 'sync.resolve_conflict',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionCode[] = Object.values(PERMISSIONS);

export const ROLE_NAMES = {
  ADMIN: 'ADMIN',
  CASHIER: 'CASHIER',
} as const;

/**
 * Cashiers get exactly what the counter needs. The exclusions are
 * deliberate: no price changes, no unrestricted stock adjustment, no user
 * management, no financial reporting (PROMPT.md §6).
 */
export const CASHIER_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.POS_ACCESS,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.CATEGORY_VIEW,
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.SALE_CREATE,
  PERMISSIONS.SALE_VIEW,
  PERMISSIONS.SALE_HOLD,
  PERMISSIONS.SALE_DISCOUNT,
  PERMISSIONS.CUSTOMER_VIEW,
  PERMISSIONS.CUSTOMER_MANAGE,
  PERMISSIONS.SHIFT_OPEN,
  PERMISSIONS.SHIFT_CLOSE_OWN,
  PERMISSIONS.RETURN_VIEW,
];

/** Admin/Owner holds everything. */
export const ADMIN_PERMISSIONS: PermissionCode[] = ALL_PERMISSIONS;

export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, string> = {
  [PERMISSIONS.DASHBOARD_VIEW]: 'View the dashboard',
  [PERMISSIONS.REPORT_VIEW]: 'View reports',
  [PERMISSIONS.REPORT_EXPORT]: 'Export reports to Excel and PDF',
  [PERMISSIONS.REPORT_VIEW_FINANCIAL]: 'View financial figures such as cost and margin',
  [PERMISSIONS.PRODUCT_VIEW]: 'View products',
  [PERMISSIONS.PRODUCT_CREATE]: 'Create products',
  [PERMISSIONS.PRODUCT_UPDATE]: 'Edit product details',
  [PERMISSIONS.PRODUCT_UPDATE_PRICE]: 'Change product prices',
  [PERMISSIONS.PRODUCT_DEACTIVATE]: 'Deactivate products',
  [PERMISSIONS.CATEGORY_VIEW]: 'View categories',
  [PERMISSIONS.CATEGORY_MANAGE]: 'Create, edit and deactivate categories',
  [PERMISSIONS.INVENTORY_VIEW]: 'View stock levels and movements',
  [PERMISSIONS.INVENTORY_STOCK_IN]: 'Receive stock',
  [PERMISSIONS.INVENTORY_ADJUST]: 'Adjust stock levels',
  [PERMISSIONS.INVENTORY_WRITE_OFF]: 'Write off damaged or expired stock',
  [PERMISSIONS.BATCH_MANAGE]: 'Manage product batches and expiry dates',
  [PERMISSIONS.POS_ACCESS]: 'Use the point of sale',
  [PERMISSIONS.SALE_VIEW]: 'View own sales',
  [PERMISSIONS.SALE_VIEW_ALL]: 'View all sales',
  [PERMISSIONS.SALE_CREATE]: 'Complete sales',
  [PERMISSIONS.SALE_DISCOUNT]: 'Apply discounts up to the configured limit',
  [PERMISSIONS.SALE_DISCOUNT_UNLIMITED]: 'Apply discounts of any size',
  [PERMISSIONS.SALE_HOLD]: 'Hold and retrieve transactions',
  [PERMISSIONS.SALE_VOID]: 'Void a sale',
  [PERMISSIONS.RETURN_VIEW]: 'View returns',
  [PERMISSIONS.RETURN_CREATE]: 'Process returns and refunds',
  [PERMISSIONS.CUSTOMER_VIEW]: 'View customers',
  [PERMISSIONS.CUSTOMER_MANAGE]: 'Create and edit customers',
  [PERMISSIONS.USER_VIEW]: 'View staff',
  [PERMISSIONS.USER_MANAGE]: 'Create, edit and deactivate staff',
  [PERMISSIONS.ROLE_MANAGE]: 'Manage roles and permissions',
  [PERMISSIONS.SHIFT_OPEN]: 'Open a shift',
  [PERMISSIONS.SHIFT_CLOSE_OWN]: 'Close own shift',
  [PERMISSIONS.SHIFT_CLOSE_ANY]: "Close any cashier's shift",
  [PERMISSIONS.SHIFT_VIEW_ALL]: 'View all shifts',
  [PERMISSIONS.STOCKCOUNT_MANAGE]: 'Start and record physical stock counts',
  [PERMISSIONS.STOCKCOUNT_APPROVE]: 'Approve a stock count and adjust inventory to it',
  [PERMISSIONS.AUDIT_VIEW]: 'View audit logs',
  [PERMISSIONS.SETTINGS_MANAGE]: 'Change system settings',
  [PERMISSIONS.SYNC_RESOLVE_CONFLICT]: 'Resolve synchronisation conflicts',
};
