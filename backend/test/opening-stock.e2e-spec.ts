import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetTransactions } from './setup';

/**
 * Opening stock at product creation.
 *
 * This exists because opening stock used to write the inventory figure
 * and its movement but no batch, so a product that tracked expiry showed
 * its units everywhere and then refused every sale with "available 0".
 * The stock a product is created with must be sellable, whichever way it
 * is tracked — that is what these tests assert.
 */
describe('Opening stock (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => ReturnType<typeof request>;

  let admin: string;
  let cashier: string;
  let categoryId: string;

  let seq = 0;

  const login = async (email: string, password: string): Promise<string> => {
    const res = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.body.accessToken as string;
  };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const inTwoYears = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().slice(0, 10);
  };

  /** Creates a product under this suite's SKU prefix, which purge() clears. */
  const create = (body: Record<string, unknown>) => {
    seq += 1;
    return http()
      .post('/api/v1/products')
      .set(auth(admin))
      .send({
        name: `Opening Stock Test ${seq}`,
        sku: `LMB-OST-${String(seq).padStart(3, '0')}`,
        categoryId,
        costPrice: '10.00',
        sellingPrice: '25.00',
        unit: 'PIECE',
        ...body,
      });
  };

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    http = () => request(app.getHttpServer());
    admin = await login('admin@lormabeauty.local', 'LormaAdmin!2024');
    cashier = await login('cashier@lormabeauty.local', 'LormaCashier!2024');
    categoryId = (await prisma.category.findFirstOrThrow()).id;
  });

  /**
   * Removes every product this suite creates, by SKU prefix rather than by
   * what a passing test remembered — a run that fails midway must not leave
   * a SKU behind to collide with the next run.
   */
  const purge = async () => {
    // Sales referencing these products go first, or the delete trips
    // sale_items_productId_fkey.
    await resetTransactions(prisma);

    const mine = await prisma.product.findMany({
      where: { sku: { startsWith: 'LMB-OST-' } },
      select: { id: true },
    });
    const ids = mine.map((p) => p.id);
    if (!ids.length) return;

    await prisma.productBatch.deleteMany({ where: { productId: { in: ids } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productBarcode.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  };

  afterEach(purge);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await purge();
  });

  const sell = (productId: string, quantity: number) =>
    http()
      .post('/api/v1/sales')
      .set(auth(cashier))
      .send({
        items: [{ productId, quantity }],
        payments: [
          {
            method: 'CASH',
            amount: (25 * quantity).toFixed(2),
            amountTendered: (25 * quantity).toFixed(2),
          },
        ],
      });

  it('opening stock on a plain product is sellable', async () => {
    const res = await create({ openingStock: 20 }).expect(201);
    await sell(res.body.id, 2).expect(201);

    const inv = await prisma.inventory.findUniqueOrThrow({
      where: { productId: res.body.id },
    });
    expect(inv.quantity).toBe(18);
  });

  it('opening stock on an expiry-tracked product is sellable', async () => {
    const res = await create({
      openingStock: 20,
      tracksExpiry: true,
      openingBatchNumber: 'OPEN-001',
      openingExpiryDate: inTwoYears(),
    }).expect(201);
    // The regression: this used to fail with INSUFFICIENT_STOCK because no
    // batch existed for FEFO to draw from.
    await sell(res.body.id, 2).expect(201);

    const inv = await prisma.inventory.findUniqueOrThrow({
      where: { productId: res.body.id },
    });
    expect(inv.quantity).toBe(18);
  });

  it('creates a batch holding exactly the opening stock', async () => {
    const res = await create({
      openingStock: 12,
      tracksExpiry: true,
      openingBatchNumber: 'OPEN-002',
      openingExpiryDate: inTwoYears(),
    }).expect(201);
    const batches = await prisma.productBatch.findMany({
      where: { productId: res.body.id },
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].batchNumber).toBe('OPEN-002');
    expect(batches[0].quantity).toBe(12);
  });

  it('refuses expiry-tracked opening stock with no batch details', async () => {
    const res = await create({ openingStock: 20, tracksExpiry: true }).expect(400);
    expect(res.body.message).toMatch(/batch number and expiry/i);

    // The whole creation rolls back rather than leaving a half-made product.
    const orphan = await prisma.product.findFirst({
      where: { sku: `LMB-OST-${String(seq).padStart(3, '0')}` },
    });
    expect(orphan).toBeNull();
  });

  it('refuses an opening batch that has already expired', async () => {
    await create({
      openingStock: 20,
      tracksExpiry: true,
      openingBatchNumber: 'OPEN-OLD',
      openingExpiryDate: '2020-01-01',
    }).expect(400);
  });

  it('an expiry-tracked product may still be created with no opening stock', async () => {
    const res = await create({ openingStock: 0, tracksExpiry: true }).expect(201);
    const batches = await prisma.productBatch.count({ where: { productId: res.body.id } });
    expect(batches).toBe(0);
  });

  it('records the opening stock as a movement against its batch', async () => {
    const res = await create({
      openingStock: 7,
      tracksExpiry: true,
      openingBatchNumber: 'OPEN-003',
      openingExpiryDate: inTwoYears(),
    }).expect(201);
    const moves = await prisma.inventoryMovement.findMany({
      where: { productId: res.body.id },
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe('OPENING_BALANCE');
    expect(moves[0].quantity).toBe(7);
    expect(moves[0].batchId).not.toBeNull();
  });
});
