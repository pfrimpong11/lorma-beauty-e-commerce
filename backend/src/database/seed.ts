/**
 * Lorma Beauty POS — development / demo seed (PROMPT.md §45)
 *
 * Idempotent: every row is upserted by a natural key, so running this
 * repeatedly against the same database converges rather than duplicating.
 *
 * The credentials below are DEVELOPMENT ONLY and are printed on completion.
 * They must never be used in production — see README "Seed data".
 */
import { PrismaClient, ProductUnit, MovementType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  ADMIN_PERMISSIONS,
  CASHIER_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ALL_PERMISSIONS,
  ROLE_NAMES,
  type PermissionCode,
} from '../common/permissions';

const prisma = new PrismaClient();

/**
 * Demo data is opt-in.
 *
 * Everything a real shop needs — permissions, roles, users, categories,
 * settings, counters and the Walk-in Customer — is created either way.
 * The invented products and customers are not, because a seed that always
 * loads them can only be run once safely, and someone will eventually run
 * it twice.
 */
const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * `??` only falls back when a variable is absent. An empty one satisfies it,
 * which is how this seed once created accounts with no password at all —
 * `SEED_ADMIN_PASSWORD=` in an env file is an empty string, not undefined.
 */
function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value;
}

const SEED_ADMIN_EMAIL = envOr('SEED_ADMIN_EMAIL', 'admin@lormabeauty.local');
const SEED_ADMIN_PASSWORD = envOr('SEED_ADMIN_PASSWORD', 'LormaAdmin!2024');
const SEED_CASHIER_EMAIL = envOr('SEED_CASHIER_EMAIL', 'cashier@lormabeauty.local');
const SEED_CASHIER_PASSWORD = envOr('SEED_CASHIER_PASSWORD', 'LormaCashier!2024');
const BCRYPT_ROUNDS = Number.parseInt(envOr('BCRYPT_ROUNDS', '12'), 10);

const CATEGORIES = [
  ['Face Care', 'Everyday facial care essentials'],
  ['Body Care', 'Body lotions, butters and scrubs'],
  ['Hair Care', 'Shampoos, conditioners and treatments'],
  ['Cleansers', 'Face washes, gels and micellar waters'],
  ['Serums', 'Concentrated active treatments'],
  ['Moisturizers', 'Creams, gels and hydrating lotions'],
  ['Sunscreens', 'Daily SPF protection'],
  ['Toners', 'Balancing and exfoliating toners'],
  ['Masks', 'Sheet, clay and overnight masks'],
  ['Accessories', 'Tools, applicators and gift items'],
] as const;

interface SeedProduct {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  cost: string;
  price: string;
  stock: number;
  minStock: number;
  unit: ProductUnit;
  tracksExpiry: boolean;
  /** Additional codes that resolve to the same product. */
  extraBarcodes?: string[];
  /** SERIALIZED when every unit carries its own barcode. */
  serialized?: boolean;
  /** Months from today until this batch expires. */
  expiresInMonths?: number;
}

const PRODUCTS: SeedProduct[] = [
  { name: 'Vitamin C Brightening Serum 30ml', sku: 'LMB-SER-001', barcode: '6001234500017', category: 'Serums', brand: 'Lorma Essentials', cost: '72.00', price: '120.00', stock: 48, minStock: 10, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 14 },
  { name: 'Niacinamide 10% + Zinc Serum 30ml', sku: 'LMB-SER-002', barcode: '6001234500024', category: 'Serums', brand: 'Lorma Essentials', cost: '55.00', price: '95.00', stock: 36, minStock: 10, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 18 },
  { name: 'Hyaluronic Acid Hydrating Serum 30ml', sku: 'LMB-SER-003', barcode: '6001234500031', category: 'Serums', brand: 'Lorma Essentials', cost: '60.00', price: '105.00', stock: 8, minStock: 12, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 20 },
  { name: 'Retinol 0.5% Night Serum 30ml', sku: 'LMB-SER-004', barcode: '6001234500048', category: 'Serums', brand: 'Lorma Pro', cost: '98.00', price: '165.00', stock: 22, minStock: 8, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 2 },

  { name: 'Broad Spectrum SPF 50 Sunscreen 50ml', sku: 'LMB-SUN-001', barcode: '6001234500055', category: 'Sunscreens', brand: 'Lorma Shield', cost: '54.00', price: '90.00', stock: 60, minStock: 15, unit: ProductUnit.TUBE, tracksExpiry: true, expiresInMonths: 16 },
  { name: 'Invisible Fluid SPF 30 40ml', sku: 'LMB-SUN-002', barcode: '6001234500062', category: 'Sunscreens', brand: 'Lorma Shield', cost: '42.00', price: '75.00', stock: 34, minStock: 10, unit: ProductUnit.TUBE, tracksExpiry: true, expiresInMonths: 11 },

  { name: 'Gentle Foaming Cleanser 150ml', sku: 'LMB-CLN-001', barcode: '6001234500079', category: 'Cleansers', brand: 'Lorma Essentials', cost: '38.00', price: '68.00', stock: 52, minStock: 12, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 22 },
  { name: 'Salicylic Acid Clarifying Gel Wash 150ml', sku: 'LMB-CLN-002', barcode: '6001234500086', category: 'Cleansers', brand: 'Lorma Clear', cost: '44.00', price: '78.00', stock: 27, minStock: 10, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 19 },
  { name: 'Micellar Cleansing Water 250ml', sku: 'LMB-CLN-003', barcode: '6001234500093', category: 'Cleansers', brand: 'Lorma Essentials', cost: '32.00', price: '58.00', stock: 0, minStock: 10, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 24 },

  { name: 'Ceramide Repair Moisturiser 50ml', sku: 'LMB-MOI-001', barcode: '6001234500109', category: 'Moisturizers', brand: 'Lorma Pro', cost: '68.00', price: '118.00', stock: 41, minStock: 10, unit: ProductUnit.JAR, tracksExpiry: true, expiresInMonths: 15 },
  { name: 'Oil-Free Gel Moisturiser 50ml', sku: 'LMB-MOI-002', barcode: '6001234500116', category: 'Moisturizers', brand: 'Lorma Clear', cost: '50.00', price: '88.00', stock: 29, minStock: 10, unit: ProductUnit.JAR, tracksExpiry: true, expiresInMonths: 17 },
  { name: 'Rich Night Cream 50ml', sku: 'LMB-MOI-003', barcode: '6001234500123', category: 'Moisturizers', brand: 'Lorma Pro', cost: '76.00', price: '130.00', stock: 18, minStock: 8, unit: ProductUnit.JAR, tracksExpiry: true, expiresInMonths: 13 },

  { name: 'Rose Water Balancing Toner 200ml', sku: 'LMB-TON-001', barcode: '6001234500130', category: 'Toners', brand: 'Lorma Essentials', cost: '30.00', price: '55.00', stock: 45, minStock: 12, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 21 },
  { name: 'Glycolic Acid 7% Exfoliating Toner 200ml', sku: 'LMB-TON-002', barcode: '6001234500147', category: 'Toners', brand: 'Lorma Pro', cost: '58.00', price: '98.00', stock: 3, minStock: 10, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 1 },

  { name: 'Hydrating Sheet Mask (Single)', sku: 'LMB-MSK-001', barcode: '6001234500154', category: 'Masks', brand: 'Lorma Essentials', cost: '8.00', price: '18.00', stock: 180, minStock: 40, unit: ProductUnit.SACHET, tracksExpiry: true, expiresInMonths: 9 },
  { name: 'Kaolin Clay Purifying Mask 100ml', sku: 'LMB-MSK-002', barcode: '6001234500161', category: 'Masks', brand: 'Lorma Clear', cost: '40.00', price: '72.00', stock: 24, minStock: 8, unit: ProductUnit.JAR, tracksExpiry: true, expiresInMonths: 23 },

  { name: 'Shea Body Butter 250ml', sku: 'LMB-BOD-001', barcode: '6001234500178', category: 'Body Care', brand: 'Lorma Naturals', cost: '45.00', price: '80.00', stock: 38, minStock: 10, unit: ProductUnit.JAR, tracksExpiry: true, expiresInMonths: 18 },
  { name: 'Cocoa Body Lotion 400ml', sku: 'LMB-BOD-002', barcode: '6001234500185', category: 'Body Care', brand: 'Lorma Naturals', cost: '36.00', price: '65.00', stock: 56, minStock: 15, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 20 },
  { name: 'Coffee Body Scrub 200g', sku: 'LMB-BOD-003', barcode: '6001234500192', category: 'Body Care', brand: 'Lorma Naturals', cost: '28.00', price: '52.00', stock: 31, minStock: 10, unit: ProductUnit.JAR, tracksExpiry: true, expiresInMonths: 12 },

  { name: 'Argan Repair Shampoo 300ml', sku: 'LMB-HAR-001', barcode: '6001234500208', category: 'Hair Care', brand: 'Lorma Naturals', cost: '40.00', price: '72.00', stock: 33, minStock: 10, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 22 },
  { name: 'Deep Conditioning Hair Mask 250ml', sku: 'LMB-HAR-002', barcode: '6001234500215', category: 'Hair Care', brand: 'Lorma Naturals', cost: '48.00', price: '85.00', stock: 21, minStock: 8, unit: ProductUnit.JAR, tracksExpiry: true, expiresInMonths: 19 },

  { name: 'Daily Glow Face Cream 50ml', sku: 'LMB-FAC-001', barcode: '6001234500222', category: 'Face Care', brand: 'Lorma Essentials', cost: '52.00', price: '92.00', stock: 44, minStock: 12, unit: ProductUnit.JAR, tracksExpiry: true, expiresInMonths: 16 },
  { name: 'Under-Eye Brightening Cream 15ml', sku: 'LMB-FAC-002', barcode: '6001234500239', category: 'Face Care', brand: 'Lorma Pro', cost: '62.00', price: '108.00', stock: 26, minStock: 8, unit: ProductUnit.TUBE, tracksExpiry: true, expiresInMonths: 14 },
  { name: 'Lip Repair Balm 10g', sku: 'LMB-FAC-003', barcode: '6001234500246', category: 'Face Care', brand: 'Lorma Essentials', cost: '14.00', price: '28.00', stock: 95, minStock: 25, unit: ProductUnit.TUBE, tracksExpiry: true, expiresInMonths: 25 },

  { name: 'Facial Cleansing Brush', sku: 'LMB-ACC-001', barcode: '6001234500253', category: 'Accessories', brand: 'Lorma Tools', cost: '35.00', price: '65.00', stock: 19, minStock: 6, unit: ProductUnit.PIECE, tracksExpiry: false },
  { name: 'Jade Facial Roller', sku: 'LMB-ACC-002', barcode: '6001234500260', category: 'Accessories', brand: 'Lorma Tools', cost: '42.00', price: '78.00', stock: 14, minStock: 5, unit: ProductUnit.PIECE, tracksExpiry: false },
  // Supplier reprinted the code between production runs, so old and new
  // cartons are both on the shelf — same product, three codes.
  { name: 'Cocoa Body Lotion 400ml (Refill)', sku: 'LMB-BOD-004', barcode: '6001234500284', extraBarcodes: ['6001234500291', '6001234500307'], category: 'Body Care', brand: 'Lorma Naturals', cost: '34.00', price: '62.00', stock: 40, minStock: 10, unit: ProductUnit.BOTTLE, tracksExpiry: true, expiresInMonths: 20 },
  // Each gift set is individually barcoded, so a code is one physical box.
  { name: 'Lorma Beauty Gift Set (Starter)', sku: 'LMB-ACC-003', barcode: '6001234500277', category: 'Accessories', brand: 'Lorma Beauty', cost: '150.00', price: '260.00', stock: 11, minStock: 4, unit: ProductUnit.SET, tracksExpiry: false, serialized: true, extraBarcodes: ['6001234500284001', '6001234500284002', '6001234500284003'] },
];

const SETTINGS: Array<[string, Prisma.InputJsonValue, string]> = [
  ['store.name', 'Lorma Beauty', 'Business name shown on receipts and reports'],
  ['store.tagline', 'Skincare & Beauty', 'Line printed under the business name'],
  ['store.phone', '', 'Contact number printed on receipts'],
  ['store.address', '', 'Address printed on receipts'],
  ['store.receiptFooter', 'Thank you for shopping with Lorma Beauty.', 'Closing line on receipts'],
  ['currency.code', 'GHS', 'ISO currency code'],
  ['expiry.warningDays', 30, 'Days before expiry a product is flagged'],
  ['shift.varianceThreshold', '20.00', 'Cash variance above which a reason is required'],
  ['discount.maxPercentForCashier', 10, 'Largest discount a cashier may apply without approval'],
  ['sale.blockExpiredProducts', true, 'Expired batches can never be sold (§51.3)'],
];

function monthsFromNow(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setHours(0, 0, 0, 0);
  return d;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function seedPermissionsAndRoles() {
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSION_DESCRIPTIONS[code] },
      create: { code, description: PERMISSION_DESCRIPTIONS[code] },
    });
  }

  const adminRole = await prisma.role.upsert({
    where: { name: ROLE_NAMES.ADMIN },
    update: {},
    create: { name: ROLE_NAMES.ADMIN, description: 'Owner / administrator', isSystem: true },
  });

  const cashierRole = await prisma.role.upsert({
    where: { name: ROLE_NAMES.CASHIER },
    update: {},
    create: { name: ROLE_NAMES.CASHIER, description: 'Counter cashier', isSystem: true },
  });

  const grant = async (roleId: string, codes: PermissionCode[]) => {
    const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });
    // Replace rather than merge, so removing a permission from the catalogue
    // actually revokes it on the next seed run.
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      skipDuplicates: true,
    });
  };

  await grant(adminRole.id, ADMIN_PERMISSIONS);
  await grant(cashierRole.id, CASHIER_PERMISSIONS);

  return { adminRole, cashierRole };
}

async function seedUsers(adminRoleId: string, cashierRoleId: string) {
  const [adminHash, cashierHash] = await Promise.all([
    bcrypt.hash(SEED_ADMIN_PASSWORD, BCRYPT_ROUNDS),
    bcrypt.hash(SEED_CASHIER_PASSWORD, BCRYPT_ROUNDS),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: { roleId: adminRoleId, isActive: true },
    create: {
      email: SEED_ADMIN_EMAIL,
      passwordHash: adminHash,
      firstName: 'Lorma',
      lastName: 'Owner',
      phone: '+233200000001',
      roleId: adminRoleId,
    },
  });

  const cashier = await prisma.user.upsert({
    where: { email: SEED_CASHIER_EMAIL },
    update: { roleId: cashierRoleId, isActive: true },
    create: {
      email: SEED_CASHIER_EMAIL,
      passwordHash: cashierHash,
      firstName: 'Ama',
      lastName: 'Mensah',
      phone: '+233200000002',
      roleId: cashierRoleId,
    },
  });

  return { admin, cashier };
}

async function seedCatalogue(adminId: string) {
  const categoryIds = new Map<string, string>();

  for (const [index, [name, description]] of CATEGORIES.entries()) {
    const category = await prisma.category.upsert({
      where: { name },
      update: { description, sortOrder: index },
      create: { name, slug: slugify(name), description, sortOrder: index },
    });
    categoryIds.set(name, category.id);
  }

  // Invented stock. A real shop's catalogue arrives through Products and
  // Receive stock, with real barcodes, batches and costs behind it.
  if (!SEED_DEMO_DATA) return categoryIds.size;

  for (const p of PRODUCTS) {
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) throw new Error(`Unknown category "${p.category}" for ${p.sku}`);

    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        categoryId,
        brand: p.brand,
        costPrice: new Prisma.Decimal(p.cost),
        sellingPrice: new Prisma.Decimal(p.price),
        minStockLevel: p.minStock,
        unit: p.unit,
        tracksExpiry: p.tracksExpiry,
        barcodeMode: p.serialized ? 'SERIALIZED' : 'SHARED',
      },
      create: {
        name: p.name,
        sku: p.sku,
        categoryId,
        brand: p.brand,
        costPrice: new Prisma.Decimal(p.cost),
        sellingPrice: new Prisma.Decimal(p.price),
        minStockLevel: p.minStock,
        unit: p.unit,
        tracksExpiry: p.tracksExpiry,
        barcodeMode: p.serialized ? 'SERIALIZED' : 'SHARED',
      },
    });

    // Barcodes live in their own table; the seeded one is the primary.
    await prisma.productBarcode.upsert({
      where: { barcode: p.barcode },
      update: { productId: product.id, isPrimary: true, isActive: true },
      create: { productId: product.id, barcode: p.barcode, isPrimary: true, isActive: true },
    });

    // Extra codes, where a product carries more than one.
    for (const extra of p.extraBarcodes ?? []) {
      await prisma.productBarcode.upsert({
        where: { barcode: extra },
        update: { productId: product.id, isActive: true },
        create: { productId: product.id, barcode: extra, isPrimary: false, isActive: true },
      });
    }

    const existing = await prisma.inventory.findUnique({ where: { productId: product.id } });

    if (!existing) {
      // Opening balance goes through the ledger like any other movement —
      // stock must never appear without a recorded reason (§13).
      await prisma.$transaction(async (tx) => {
        await tx.inventory.create({ data: { productId: product.id, quantity: p.stock } });

        let batchId: string | null = null;
        if (p.tracksExpiry && p.expiresInMonths !== undefined && p.stock > 0) {
          const batch = await tx.productBatch.create({
            data: {
              productId: product.id,
              batchNumber: `B-${p.sku.split('-').pop()}-01`,
              expiryDate: monthsFromNow(p.expiresInMonths),
              quantity: p.stock,
              costPrice: new Prisma.Decimal(p.cost),
            },
          });
          batchId = batch.id;
        }

        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            batchId,
            type: MovementType.OPENING_BALANCE,
            quantity: p.stock,
            previousQty: 0,
            newQty: p.stock,
            reason: 'Opening balance (seed data)',
            unitCost: new Prisma.Decimal(p.cost),
            userId: adminId,
          },
        });
      });
    }
  }

  return categoryIds.size;
}

async function seedCustomersAndCounters() {
  const walkIn = await prisma.customer.findFirst({ where: { isWalkIn: true } });
  if (!walkIn) {
    await prisma.customer.create({
      data: { name: 'Walk-in Customer', isWalkIn: true, notes: 'Default customer for counter sales' },
    });
  }

  // Invented people. Real customers are captured at the till.
  if (SEED_DEMO_DATA) {
    for (const [name, phone] of [
      ['Akosua Boateng', '+233244000101'],
      ['Nana Adjei', '+233244000102'],
      ['Efua Danso', '+233244000103'],
    ] as const) {
      await prisma.customer.upsert({
        where: { phone },
        update: {},
        create: { name, phone },
      });
    }
  }

  for (const name of ['receipt', 'return', 'shift', 'stockcount']) {
    await prisma.counter.upsert({ where: { name }, update: {}, create: { name, value: 0 } });
  }
}

async function seedSettings() {
  for (const [key, value, description] of SETTINGS) {
    await prisma.setting.upsert({
      where: { key },
      update: { description },
      create: { key, value, description },
    });
  }
}

/**
 * Refuse anything that could damage a live shop before touching the
 * database.
 *
 * This exists because the seed was once run by hand against production. It
 * loaded demo stock into a real catalogue and created accounts with empty
 * passwords, because the env vars were present but blank. Every check below
 * is one of the ways that went wrong.
 */
function assertSafeToRun(): void {
  if (IS_PRODUCTION && SEED_DEMO_DATA) {
    throw new Error(
      'Refusing to load demo data into production. Unset SEED_DEMO_DATA, or run this against staging.',
    );
  }

  if (IS_PRODUCTION && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error(
      'Refusing to seed production.\n\n' +
        'This is a one-off bootstrap for an EMPTY database — it creates permissions,\n' +
        'roles, the first two users, categories, settings and counters. It never\n' +
        'changes an existing user\'s password.\n\n' +
        'If that is genuinely what you want:\n' +
        '  docker exec -e ALLOW_PRODUCTION_SEED=true \\\n' +
        '    -e SEED_ADMIN_EMAIL=... -e SEED_ADMIN_PASSWORD=... \\\n' +
        '    -e SEED_CASHIER_EMAIL=... -e SEED_CASHIER_PASSWORD=... \\\n' +
        '    <backend-container> node dist/database/seed.js',
    );
  }

  // Outside demo mode the built-in credentials must never be reachable:
  // they are published in the README and in this file.
  if (!SEED_DEMO_DATA) {
    const required = [
      ['SEED_ADMIN_EMAIL', process.env.SEED_ADMIN_EMAIL],
      ['SEED_ADMIN_PASSWORD', process.env.SEED_ADMIN_PASSWORD],
      ['SEED_CASHIER_EMAIL', process.env.SEED_CASHIER_EMAIL],
      ['SEED_CASHIER_PASSWORD', process.env.SEED_CASHIER_PASSWORD],
    ] as const;

    const missing = required
      .filter(([, value]) => value === undefined || value.trim() === '')
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `Set these before seeding without demo data: ${missing.join(', ')}.\n` +
          'They have no safe default — the built-in ones are published in the README.',
      );
    }

    const short = [
      ['SEED_ADMIN_PASSWORD', SEED_ADMIN_PASSWORD],
      ['SEED_CASHIER_PASSWORD', SEED_CASHIER_PASSWORD],
    ].filter(([, value]) => value.length < 12);

    if (short.length > 0) {
      throw new Error(
        `Too short (at least 12 characters): ${short.map(([n]) => n).join(', ')}.`,
      );
    }
  }
}

async function main() {
  assertSafeToRun();

  console.log(
    `Seeding Lorma Beauty POS${SEED_DEMO_DATA ? ' with demo data' : ' (demo data skipped)'}...\n`,
  );

  const { adminRole, cashierRole } = await seedPermissionsAndRoles();
  console.log(`  roles/permissions  ${ALL_PERMISSIONS.length} permissions, 2 roles`);

  const { admin, cashier } = await seedUsers(adminRole.id, cashierRole.id);
  console.log(`  users              ${admin.email}, ${cashier.email}`);

  const categoryCount = await seedCatalogue(admin.id);
  // Report what was created, not what the file contains: a summary claiming
  // 28 products against an empty catalogue is how nobody noticed sooner.
  console.log(
    `  catalogue          ${categoryCount} categories, ` +
      `${SEED_DEMO_DATA ? PRODUCTS.length : 0} products${SEED_DEMO_DATA ? '' : ' (demo data skipped)'}`,
  );

  await seedCustomersAndCounters();
  console.log(
    `  customers          Walk-in Customer${SEED_DEMO_DATA ? ' + 3 demo customers' : ' only'}`,
  );
  console.log('  counters           receipt, return, shift, stockcount');

  await seedSettings();
  console.log(`  settings           ${SETTINGS.length} keys`);

  if (SEED_DEMO_DATA) {
    console.log('\nDevelopment credentials (NEVER use these in production):');
    console.log(`  ADMIN    ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD}`);
    console.log(`  CASHIER  ${SEED_CASHIER_EMAIL} / ${SEED_CASHIER_PASSWORD}`);
  } else {
    // The passwords came from the environment; whoever set them has them.
    // Printing them here would put them in deploy logs and shell history.
    console.log('\nAccounts created (passwords were supplied by you, and are not printed):');
    console.log(`  ADMIN    ${SEED_ADMIN_EMAIL}`);
    console.log(`  CASHIER  ${SEED_CASHIER_EMAIL}`);
    console.log('\nAn existing user keeps the password they already had.');
  }

  console.log('\nSeed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
