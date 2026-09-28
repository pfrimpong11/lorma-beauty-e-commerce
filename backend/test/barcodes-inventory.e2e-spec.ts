import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetTransactions } from './setup';

/**
 * Admin barcode and inventory management.
 *
 * Run against a real PostgreSQL through the real application graph, so
 * the unique constraints, the partial index behind "one primary per
 * product" and the approval transaction are all genuinely exercised.
 */
describe('Barcodes and inventory (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => ReturnType<typeof request>;

  let admin: string;
  let cashier: string;
  let productId: string;
  let otherId: string;

  const login = async (email: string, password: string): Promise<string> => {
    const res = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.body.accessToken as string;
  };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    http = () => request(app.getHttpServer());
    admin = await login('admin@lormabeauty.local', 'LormaAdmin!2024');
    cashier = await login('cashier@lormabeauty.local', 'LormaCashier!2024');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTransactions(prisma);
    await prisma.stockCountScan.deleteMany();
    await prisma.stockCountItem.deleteMany();
    await prisma.stockCount.deleteMany();
    await prisma.counter.updateMany({ where: { name: 'stockcount' }, data: { value: 0 } });

    const a = await prisma.product.findFirstOrThrow({ where: { sku: 'LMB-SER-002' } });
    const b = await prisma.product.findFirstOrThrow({ where: { sku: 'LMB-TON-001' } });
    productId = a.id;
    otherId = b.id;

    // A clean, known barcode set for each test.
    await prisma.productBarcode.deleteMany({ where: { productId: { in: [a.id, b.id] } } });
    await prisma.productBarcode.create({
      data: { productId: a.id, barcode: 'TEST-A-0001', isPrimary: true },
    });
    await prisma.productBarcode.create({
      data: { productId: b.id, barcode: 'TEST-B-0001', isPrimary: true },
    });
    await prisma.product.update({ where: { id: a.id }, data: { barcodeMode: 'SHARED' } });
    await prisma.inventory.update({ where: { productId: a.id }, data: { quantity: 50 } });
    await prisma.inventory.update({ where: { productId: b.id }, data: { quantity: 30 } });
  });

  const stockOf = async (id: string) =>
    (await prisma.inventory.findUniqueOrThrow({ where: { productId: id } })).quantity;

  // --- barcodes -----------------------------------------------------------

  it('adds a barcode and resolves it to the product', async () => {
    await http()
      .post(`/api/v1/products/${productId}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'TEST-A-0002' })
      .expect(201);

    const res = await http()
      .get('/api/v1/products/barcode/TEST-A-0002')
      .set(auth(admin))
      .expect(200);

    expect(res.body.found).toBe(true);
    expect(res.body.product.id).toBe(productId);
  });

  it('keeps several barcodes pointing at one product and one price', async () => {
    for (const code of ['TEST-A-0002', 'TEST-A-0003']) {
      await http()
        .post(`/api/v1/products/${productId}/barcodes`)
        .set(auth(admin))
        .send({ barcode: code })
        .expect(201);
    }

    const prices = new Set<string>();
    for (const code of ['TEST-A-0001', 'TEST-A-0002', 'TEST-A-0003']) {
      const res = await http().get(`/api/v1/products/barcode/${code}`).set(auth(admin)).expect(200);
      expect(res.body.product.id).toBe(productId);
      prices.add(res.body.product.sellingPrice);
    }
    // Price is on the product, so it cannot differ by barcode.
    expect(prices.size).toBe(1);
  });

  it('preserves leading zeros', async () => {
    await http()
      .post(`/api/v1/products/${productId}/barcodes`)
      .set(auth(admin))
      .send({ barcode: '0012345678905' })
      .expect(201);

    const stored = await prisma.productBarcode.findUniqueOrThrow({
      where: { barcode: '0012345678905' },
    });
    expect(stored.barcode).toBe('0012345678905');

    const res = await http()
      .get('/api/v1/products/barcode/0012345678905')
      .set(auth(admin))
      .expect(200);
    expect(res.body.matchedBarcode).toBe('0012345678905');
  });

  it('refuses a barcode that belongs to another product, and names it', async () => {
    const res = await http()
      .post(`/api/v1/products/${otherId}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'TEST-A-0001' })
      .expect(409);

    expect(res.body.message).toContain('already belongs to');
  });

  it('keeps exactly one primary barcode per product', async () => {
    const added = await http()
      .post(`/api/v1/products/${productId}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'TEST-A-0002' })
      .expect(201);

    await http()
      .patch(`/api/v1/products/${productId}/barcodes/${added.body.id}`)
      .set(auth(admin))
      .send({ isPrimary: true })
      .expect(200);

    const primaries = await prisma.productBarcode.count({
      where: { productId, isPrimary: true },
    });
    expect(primaries).toBe(1);
  });

  it('deactivates a barcode so it no longer resolves', async () => {
    const added = await http()
      .post(`/api/v1/products/${productId}/barcodes`)
      .set(auth(admin))
      .send({ barcode: 'TEST-A-0002' })
      .expect(201);

    await http()
      .patch(`/api/v1/products/${productId}/barcodes/${added.body.id}`)
      .set(auth(admin))
      .send({ isActive: false })
      .expect(200);

    const res = await http()
      .get('/api/v1/products/barcode/TEST-A-0002')
      .set(auth(admin))
      .expect(200);
    expect(res.body.found).toBe(false);
  });

  it('will not deactivate the primary barcode', async () => {
    const primary = await prisma.productBarcode.findFirstOrThrow({
      where: { productId, isPrimary: true },
    });

    await http()
      .patch(`/api/v1/products/${productId}/barcodes/${primary.id}`)
      .set(auth(admin))
      .send({ isActive: false })
      .expect(400);
  });

  it('refuses barcode management to a cashier', async () => {
    await http()
      .post(`/api/v1/products/${productId}/barcodes`)
      .set(auth(cashier))
      .send({ barcode: 'TEST-A-9999' })
      .expect(403);
  });

  // --- receiving ----------------------------------------------------------

  it('receives a delivery and writes one movement per line', async () => {
    const before = await stockOf(otherId);

    await http()
      .post('/api/v1/inventory/receive')
      .set(auth(admin))
      .send({
        reason: 'Delivery INV-1234',
        lines: [
          { productId: otherId, quantity: 6, batchNumber: 'B-T-1', expiryDate: '2027-12-31' },
        ],
      })
      .expect(201);

    expect(await stockOf(otherId)).toBe(before + 6);

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { productId: otherId, type: 'STOCK_IN' },
      orderBy: { createdAt: 'desc' },
    });
    expect(movement.quantity).toBe(6);
    expect(movement.referenceType).toBe('StockReceipt');
    expect(movement.reason).toContain('INV-1234');
  });

  it('rolls the whole delivery back if any line is invalid', async () => {
    const before = await stockOf(otherId);

    await http()
      .post('/api/v1/inventory/receive')
      .set(auth(admin))
      .send({
        reason: 'Partly invalid delivery',
        lines: [
          { productId: otherId, quantity: 5, batchNumber: 'B-T-2', expiryDate: '2027-12-31' },
          // Batch-tracked but missing its batch — the whole receipt must fail.
          { productId, quantity: 5 },
        ],
      })
      .expect(400);

    expect(await stockOf(otherId)).toBe(before);
  });

  // --- stock counts -------------------------------------------------------

  const startCount = async () => {
    const res = await http().post('/api/v1/stock-counts').set(auth(admin)).send({}).expect(201);
    return res.body.id as string;
  };

  it('counts by scanning without changing stock', async () => {
    const id = await startCount();
    const before = await stockOf(productId);

    for (let i = 0; i < 3; i++) {
      const res = await http()
        .post(`/api/v1/stock-counts/${id}/scan`)
        .set(auth(admin))
        .send({ barcode: 'TEST-A-0001' })
        .expect(201);
      expect(res.body.status).toBe('counted');
      expect(res.body.item.countedQuantity).toBe(i + 1);
    }

    // The point of the whole feature: counting is not an adjustment.
    expect(await stockOf(productId)).toBe(before);

    const detail = await http().get(`/api/v1/stock-counts/${id}`).set(auth(admin)).expect(200);
    const line = detail.body.items[0];
    expect(line.systemQuantity).toBe(50);
    expect(line.countedQuantity).toBe(3);
    expect(line.variance).toBe(-47);
  });

  it('increments on repeat scans of a shared barcode', async () => {
    const id = await startCount();
    await http().post(`/api/v1/stock-counts/${id}/scan`).set(auth(admin)).send({ barcode: 'TEST-A-0001' });
    const res = await http()
      .post(`/api/v1/stock-counts/${id}/scan`)
      .set(auth(admin))
      .send({ barcode: 'TEST-A-0001' })
      .expect(201);
    expect(res.body.item.countedQuantity).toBe(2);
  });

  it('refuses a second scan of the same serialized barcode', async () => {
    await prisma.product.update({ where: { id: productId }, data: { barcodeMode: 'SERIALIZED' } });
    const id = await startCount();

    const first = await http()
      .post(`/api/v1/stock-counts/${id}/scan`)
      .set(auth(admin))
      .send({ barcode: 'TEST-A-0001' })
      .expect(201);
    expect(first.body.status).toBe('counted');

    const second = await http()
      .post(`/api/v1/stock-counts/${id}/scan`)
      .set(auth(admin))
      .send({ barcode: 'TEST-A-0001' })
      .expect(201);
    expect(second.body.status).toBe('duplicate');

    const detail = await http().get(`/api/v1/stock-counts/${id}`).set(auth(admin)).expect(200);
    expect(detail.body.items[0].countedQuantity).toBe(1);
  });

  it('reports an unknown barcode instead of ignoring it', async () => {
    const id = await startCount();
    const res = await http()
      .post(`/api/v1/stock-counts/${id}/scan`)
      .set(auth(admin))
      .send({ barcode: '6291234567890' })
      .expect(201);

    expect(res.body.status).toBe('unknown');
    expect(res.body.barcode).toBe('6291234567890');
  });

  it('adjusts inventory only on approval, and records the movement', async () => {
    const id = await startCount();
    for (let i = 0; i < 3; i++) {
      await http().post(`/api/v1/stock-counts/${id}/scan`).set(auth(admin)).send({ barcode: 'TEST-A-0001' });
    }

    expect(await stockOf(productId)).toBe(50);

    await http()
      .post(`/api/v1/stock-counts/${id}/approve`)
      .set(auth(admin))
      .send({ note: 'End of month' })
      .expect(201);

    expect(await stockOf(productId)).toBe(3);

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { productId, type: 'STOCK_COUNT' },
    });
    expect(movement.previousQty).toBe(50);
    expect(movement.newQty).toBe(3);
    expect(movement.quantity).toBe(-47);
    expect(movement.referenceType).toBe('StockCount');
    expect(movement.referenceId).toBe(id);
  });

  it('freezes a count once approved', async () => {
    const id = await startCount();
    await http().post(`/api/v1/stock-counts/${id}/scan`).set(auth(admin)).send({ barcode: 'TEST-A-0001' });
    await http().post(`/api/v1/stock-counts/${id}/approve`).set(auth(admin)).send({}).expect(201);

    await http()
      .post(`/api/v1/stock-counts/${id}/scan`)
      .set(auth(admin))
      .send({ barcode: 'TEST-A-0001' })
      .expect(409);

    await http().post(`/api/v1/stock-counts/${id}/approve`).set(auth(admin)).send({}).expect(409);
  });

  it('leaves stock alone when a count is cancelled', async () => {
    const id = await startCount();
    await http().post(`/api/v1/stock-counts/${id}/scan`).set(auth(admin)).send({ barcode: 'TEST-A-0001' });

    await http().post(`/api/v1/stock-counts/${id}/cancel`).set(auth(admin)).send({}).expect(201);

    expect(await stockOf(productId)).toBe(50);
  });

  it('allows only one count open at a time', async () => {
    await startCount();
    await http().post('/api/v1/stock-counts').set(auth(admin)).send({}).expect(409);
  });

  it('refuses counting and approval to a cashier', async () => {
    await http().post('/api/v1/stock-counts').set(auth(cashier)).send({}).expect(403);

    const id = await startCount();
    await http()
      .post(`/api/v1/stock-counts/${id}/scan`)
      .set(auth(cashier))
      .send({ barcode: 'TEST-A-0001' })
      .expect(403);
    await http().post(`/api/v1/stock-counts/${id}/approve`).set(auth(cashier)).send({}).expect(403);
  });

  it('accepts a hand-corrected quantity', async () => {
    const id = await startCount();
    await http().post(`/api/v1/stock-counts/${id}/scan`).set(auth(admin)).send({ barcode: 'TEST-A-0001' });

    const detail = await http().get(`/api/v1/stock-counts/${id}`).set(auth(admin)).expect(200);
    const itemId = detail.body.items[0].id;

    const updated = await http()
      .patch(`/api/v1/stock-counts/${id}/items/${itemId}`)
      .set(auth(admin))
      .send({ countedQuantity: 48 })
      .expect(200);

    expect(updated.body.items[0].countedQuantity).toBe(48);
    expect(updated.body.items[0].variance).toBe(-2);
  });
});
