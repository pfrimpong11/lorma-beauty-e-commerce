import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetTransactions } from './setup';

/**
 * Deleting a product.
 *
 * §51.14 draws the line at history: a product that has been sold must stay
 * on record so its receipts, returns and reports keep resolving, while one
 * that has never been sold is a mistake and goes. These tests hold both
 * halves of that line, and the boundary between them.
 */
describe('Deleting a product (e2e)', () => {
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

  const create = async (openingStock = 10): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/products')
      .set(auth(admin))
      .send({
        name: `Delete Test ${seq}`,
        sku: `LMB-DEL-${String(seq).padStart(3, '0')}`,
        categoryId,
        costPrice: '10.00',
        sellingPrice: '25.00',
        unit: 'PIECE',
        openingStock,
      })
      .expect(201);
    return res.body.id as string;
  };

  const sell = (productId: string, quantity = 1) =>
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

  /** Clears this suite's products by SKU prefix, so a failed run cannot poison the next. */
  const purge = async () => {
    await resetTransactions(prisma);

    // Only one count may be open at a time, so a count left behind by any
    // earlier suite would make this one's 'create a count' return 409.
    await prisma.stockCountScan.deleteMany();
    await prisma.stockCountItem.deleteMany();
    await prisma.stockCount.deleteMany();
    await prisma.counter.updateMany({ where: { name: 'stockcount' }, data: { value: 0 } });
    const mine = await prisma.product.findMany({
      where: { sku: { startsWith: 'LMB-DEL-' } },
      select: { id: true },
    });
    const ids = mine.map((p) => p.id);
    if (!ids.length) return;
    await prisma.productBatch.deleteMany({ where: { productId: { in: ids } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productBarcode.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
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

  beforeEach(purge);
  afterEach(purge);

  afterAll(async () => {
    await app.close();
  });

  it('deletes a product that has never been sold', async () => {
    const id = await create();

    const res = await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.deactivated).toBe(false);

    expect(await prisma.product.findUnique({ where: { id } })).toBeNull();
  });

  it('takes its inventory, batches, movements and barcodes with it', async () => {
    const id = await create(10);
    await http()
      .post(`/api/v1/products/${id}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'DEL-TEST-0001' })
      .expect(201);

    await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);

    expect(await prisma.inventory.count({ where: { productId: id } })).toBe(0);
    expect(await prisma.productBatch.count({ where: { productId: id } })).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { productId: id } })).toBe(0);
    expect(await prisma.productBarcode.count({ where: { productId: id } })).toBe(0);
  });

  it('frees the barcode for another product to use', async () => {
    const id = await create();
    await http()
      .post(`/api/v1/products/${id}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'DEL-TEST-0002' })
      .expect(201);
    await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);

    const other = await create();
    await http()
      .post(`/api/v1/products/${other}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'DEL-TEST-0002' })
      .expect(201);
  });

  it('deactivates rather than deletes a product that has been sold', async () => {
    const id = await create(10);
    await sell(id, 2).expect(201);

    const res = await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);
    expect(res.body.deleted).toBe(false);
    expect(res.body.deactivated).toBe(true);
    expect(res.body.soldCount).toBe(1);

    const still = await prisma.product.findUniqueOrThrow({ where: { id } });
    expect(still.isActive).toBe(false);
    expect(still.deactivatedAt).not.toBeNull();
  });

  it('keeps the sale line intact when it deactivates', async () => {
    const id = await create(10);
    const sale = await sell(id, 2).expect(201);

    await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);

    // The receipt must still resolve in full — this is the whole reason the
    // product is kept rather than removed.
    const res = await http()
      .get(`/api/v1/sales/${sale.body.id}`)
      .set(auth(admin))
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(2);
  });

  it('a deactivated product no longer resolves at the till', async () => {
    const id = await create(10);
    await http()
      .post(`/api/v1/products/${id}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'DEL-TEST-0003' })
      .expect(201);
    await sell(id, 1).expect(201);
    await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);

    const res = await http()
      .get('/api/v1/products/barcode/DEL-TEST-0003')
      .set(auth(cashier))
      .expect(200);
    expect(res.body.found).toBe(false);
  });

  it('frees the barcodes of a sold product that was taken off sale', async () => {
    const id = await create(10);
    for (const code of ['DEL-TEST-0010', 'DEL-TEST-0011']) {
      await http()
        .post(`/api/v1/products/${id}/barcodes`)
        .set(auth(admin))
        .send({ barcode: code })
        .expect(201);
    }
    await sell(id, 1).expect(201);

    const res = await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);
    expect(res.body.deactivated).toBe(true);
    expect(res.body.barcodesRemoved).toBe(2);

    // The product survives for its sale history; its codes do not.
    expect(await prisma.product.findUnique({ where: { id } })).not.toBeNull();
    expect(await prisma.productBarcode.count({ where: { productId: id } })).toBe(0);

    // And the freed codes can be registered against something else.
    const other = await create();
    for (const code of ['DEL-TEST-0010', 'DEL-TEST-0011']) {
      await http()
        .post(`/api/v1/products/${other}/barcodes`)
        .set(auth(admin))
        .send({ barcode: code })
        .expect(201);
    }
  });

  it('deactivating through PATCH frees them the same way', async () => {
    const id = await create(10);
    await http()
      .post(`/api/v1/products/${id}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'DEL-TEST-0012' })
      .expect(201);
    await sell(id, 1).expect(201);

    await http()
      .patch(`/api/v1/products/${id}`)
      .set(auth(admin))
      .send({ isActive: false })
      .expect(200);

    expect(await prisma.productBarcode.count({ where: { productId: id } })).toBe(0);
  });

  it('retiring a barcode does not erase the record of it being scanned', async () => {
    const id = await create(10);
    await http()
      .post(`/api/v1/products/${id}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'DEL-TEST-0013' })
      .expect(201);

    // A scan row is only written for a serialized code — a shared one just
    // increments the counted quantity.
    await prisma.product.update({ where: { id }, data: { barcodeMode: 'SERIALIZED' } });

    const count = await http().post('/api/v1/stock-counts').set(auth(admin)).send({}).expect(201);
    await http()
      .post(`/api/v1/stock-counts/${count.body.id}/scan`)
      .set(auth(admin))
      .send({ barcode: 'DEL-TEST-0013' })
      .expect(201);
    await http()
      .post(`/api/v1/stock-counts/${count.body.id}/approve`)
      .set(auth(admin))
      .send({})
      .expect(201);

    const scanId = (
      await prisma.stockCountScan.findFirstOrThrow({ where: { barcode: 'DEL-TEST-0013' } })
    ).id;

    // The approved count makes this a deactivation, and the barcode is freed.
    const res = await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);
    expect(res.body.deactivated).toBe(true);
    expect(await prisma.productBarcode.count({ where: { productId: id } })).toBe(0);

    /*
     * The scan row must outlive the barcode it pointed at. It used to cascade,
     * which meant freeing a code quietly reduced the scan count of a count
     * that had already been approved and frozen.
     */
    const scan = await prisma.stockCountScan.findUnique({ where: { id: scanId } });
    expect(scan).not.toBeNull();
    expect(scan?.barcode).toBe('DEL-TEST-0013');
    expect(scan?.barcodeId).toBeNull();
  });

  it('refuses to delete a product that is part of an open stock count', async () => {
    const id = await create(10);
    await http()
      .post(`/api/v1/products/${id}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'DEL-TEST-0014' })
      .expect(201);

    const count = await http().post('/api/v1/stock-counts').set(auth(admin)).send({}).expect(201);
    await http()
      .post(`/api/v1/stock-counts/${count.body.id}/scan`)
      .set(auth(admin))
      .send({ barcode: 'DEL-TEST-0014' })
      .expect(201);

    // Naming the count is the point: the old failure said only "A related
    // record was not found. Please refresh and try again."
    const res = await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(400);
    expect(res.body.message).toMatch(/still open/i);
    expect(res.body.message).toMatch(new RegExp(count.body.countNumber));

    expect(await prisma.product.findUnique({ where: { id } })).not.toBeNull();
  });

  it('deactivates a product whose only history is an approved stock count', async () => {
    const id = await create(10);
    const count = await http().post('/api/v1/stock-counts').set(auth(admin)).send({}).expect(201);
    await http()
      .post(`/api/v1/stock-counts/${count.body.id}/items`)
      .set(auth(admin))
      .send({ productId: id, countedQuantity: 10 })
      .expect(201);
    await http()
      .post(`/api/v1/stock-counts/${count.body.id}/approve`)
      .set(auth(admin))
      .send({})
      .expect(201);

    // Never sold, but an approved count line must keep resolving.
    const res = await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);
    expect(res.body.deleted).toBe(false);
    expect(res.body.deactivated).toBe(true);
    expect(await prisma.product.findUnique({ where: { id } })).not.toBeNull();
  });

  it('refuses to remove an already-removed sold product twice', async () => {
    const id = await create(10);
    await sell(id, 1).expect(201);
    await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);

    const res = await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(400);
    expect(res.body.message).toMatch(/already been removed from sale/i);
  });

  it('a cashier may not delete a product', async () => {
    const id = await create();
    await http().delete(`/api/v1/products/${id}`).set(auth(cashier)).expect(403);
    expect(await prisma.product.findUnique({ where: { id } })).not.toBeNull();
  });

  it('rejects an unauthenticated delete', async () => {
    const id = await create();
    await http().delete(`/api/v1/products/${id}`).expect(401);
    expect(await prisma.product.findUnique({ where: { id } })).not.toBeNull();
  });

  it('records the deletion in the audit log', async () => {
    const id = await create();
    await http().delete(`/api/v1/products/${id}`).set(auth(admin)).expect(200);

    // The audit row outlives the product, so the deletion stays legible.
    const entry = await prisma.auditLog.findFirst({
      where: { entityId: id, action: 'PRODUCT_DELETED' },
    });
    expect(entry).not.toBeNull();
    expect(entry?.summary).toMatch(/never sold/i);
  });
});
