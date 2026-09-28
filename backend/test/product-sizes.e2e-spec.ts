import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetTransactions } from './setup';

/**
 * Sizes of one article.
 *
 * A size is a product sharing a group id, so the things that matter are
 * that each one keeps its own price, stock and barcode, that selling one
 * never touches another, and that a receipt says which was sold.
 */
describe('Product sizes (e2e)', () => {
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

  const base = async (openingStock = 10): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/products')
      .set(auth(admin))
      .send({
        name: `Size Test ${seq}`,
        sku: `LMB-SZ-${String(seq).padStart(3, '0')}`,
        categoryId,
        costPrice: '10.00',
        sellingPrice: '25.00',
        unit: 'PIECE',
        openingStock,
      })
      .expect(201);
    return res.body.id as string;
  };

  const addSize = (productId: string, body: Record<string, unknown>) =>
    http().post(`/api/v1/products/${productId}/variants`).set(auth(admin)).send(body);

  const purge = async () => {
    await resetTransactions(prisma);
    await prisma.stockCountScan.deleteMany();
    await prisma.stockCountItem.deleteMany();
    await prisma.stockCount.deleteMany();

    const mine = await prisma.product.findMany({
      where: { OR: [{ sku: { startsWith: 'LMB-SZ-' } }, { sku: { startsWith: 'SZ-' } }] },
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

  it('a product starts with no sizes', async () => {
    const id = await base();
    const res = await http().get(`/api/v1/products/${id}/variants`).set(auth(admin)).expect(200);
    expect(res.body.groupId).toBeNull();
    expect(res.body.variants).toEqual([]);
  });

  it('a product can be created with its size already set', async () => {
    seq += 1;
    const res = await http()
      .post('/api/v1/products')
      .set(auth(admin))
      .send({
        name: `Size Test ${seq}`,
        sku: `LMB-SZ-${String(seq).padStart(3, '0')}`,
        categoryId,
        costPrice: '10.00',
        sellingPrice: '25.00',
        unit: 'PIECE',
        openingStock: 6,
        variantName: 'Small',
      })
      .expect(201);

    expect(res.body.variantName).toBe('Small');
    expect(res.body.variantGroupId).not.toBeNull();

    // create() answers with the record; displayName is a presented field, so
    // it is checked where it is actually served.
    const read = await http()
      .get(`/api/v1/products/${res.body.id}`)
      .set(auth(admin))
      .expect(200);
    expect(read.body.displayName).toMatch(/— Small$/);
    expect(read.body.variantName).toBe('Small');
  });

  it('a product created with a size takes further sizes without renaming it', async () => {
    seq += 1;
    const created = await http()
      .post('/api/v1/products')
      .set(auth(admin))
      .send({
        name: `Size Test ${seq}`,
        sku: `LMB-SZ-${String(seq).padStart(3, '0')}`,
        categoryId,
        costPrice: '10.00',
        sellingPrice: '25.00',
        unit: 'PIECE',
        openingStock: 6,
        variantName: 'Small',
      })
      .expect(201);

    // It already carries a label, so baseVariantName is not needed a second time.
    const res = await addSize(created.body.id, {
      variantName: 'Large',
      sku: `SZ-L-${String(seq).padStart(3, '0')}`,
      costPrice: '20.00',
      sellingPrice: '45.00',
      openingStock: 2,
    }).expect(201);

    expect(res.body.variants).toHaveLength(2);
    expect(res.body.variants.map((v: { variantName: string }) => v.variantName)).toEqual([
      'Small',
      'Large',
    ]);
  });

  it('a product created without a size stays ungrouped', async () => {
    const id = await base();
    const p = await prisma.product.findUniqueOrThrow({ where: { id } });
    expect(p.variantGroupId).toBeNull();
    expect(p.variantName).toBeNull();
  });

  it('refuses the first size unless the existing stock is named too', async () => {
    const id = await base();
    const res = await addSize(id, {
      variantName: 'Large',
      sku: 'SZ-L-001',
      costPrice: '20.00',
      sellingPrice: '45.00',
    }).expect(400);
    expect(res.body.message).toMatch(/current one is called/i);
  });

  it('groups the existing product with the new size', async () => {
    const id = await base();
    const res = await addSize(id, {
      variantName: 'Large',
      baseVariantName: 'Small',
      sku: 'SZ-L-002',
      costPrice: '20.00',
      sellingPrice: '45.00',
      openingStock: 4,
    }).expect(201);

    expect(res.body.groupId).not.toBeNull();
    expect(res.body.variants).toHaveLength(2);
    expect(res.body.variants.map((v: { variantName: string }) => v.variantName)).toEqual([
      'Small',
      'Large',
    ]);
  });

  it('each size keeps its own price and stock', async () => {
    const id = await base(10);
    const res = await addSize(id, {
      variantName: 'Large',
      baseVariantName: 'Small',
      sku: 'SZ-L-003',
      costPrice: '20.00',
      sellingPrice: '45.00',
      openingStock: 4,
    }).expect(201);

    const byLabel = Object.fromEntries(
      res.body.variants.map((v: { variantName: string }) => [v.variantName, v]),
    );
    expect(byLabel.Small.sellingPrice).toBe('25.00');
    expect(byLabel.Small.stock).toBe(10);
    expect(byLabel.Large.sellingPrice).toBe('45.00');
    expect(byLabel.Large.stock).toBe(4);
  });

  it('selling one size does not touch another', async () => {
    const id = await base(10);
    const res = await addSize(id, {
      variantName: 'Large',
      baseVariantName: 'Small',
      sku: 'SZ-L-004',
      costPrice: '20.00',
      sellingPrice: '45.00',
      openingStock: 4,
    }).expect(201);
    const large = res.body.variants.find(
      (v: { variantName: string }) => v.variantName === 'Large',
    );

    await http()
      .post('/api/v1/sales')
      .set(auth(cashier))
      .send({
        items: [{ productId: large.id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: '90.00', amountTendered: '90.00' }],
      })
      .expect(201);

    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: large.id } })).quantity)
      .toBe(2);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: id } })).quantity)
      .toBe(10);
  });

  it('the receipt says which size was sold', async () => {
    const id = await base(10);
    const res = await addSize(id, {
      variantName: 'Extra Large',
      baseVariantName: 'Small',
      sku: 'SZ-XL-005',
      costPrice: '30.00',
      sellingPrice: '90.00',
      openingStock: 3,
    }).expect(201);
    const xl = res.body.variants.find(
      (v: { variantName: string }) => v.variantName === 'Extra Large',
    );

    const sale = await http()
      .post('/api/v1/sales')
      .set(auth(cashier))
      .send({
        items: [{ productId: xl.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: '90.00', amountTendered: '90.00' }],
      })
      .expect(201);

    // Without the size the line reads the same as every other size of the
    // same article, which makes a reprinted receipt ambiguous.
    expect(sale.body.items[0].productName).toMatch(/Extra Large/);
  });

  it('a size carries its own barcode, which resolves to it', async () => {
    const id = await base();
    const res = await addSize(id, {
      variantName: 'Large',
      baseVariantName: 'Small',
      sku: 'SZ-L-006',
      costPrice: '20.00',
      sellingPrice: '45.00',
      barcode: 'SIZE-TEST-L',
    }).expect(201);
    const large = res.body.variants.find(
      (v: { variantName: string }) => v.variantName === 'Large',
    );

    const found = await http()
      .get('/api/v1/products/barcode/SIZE-TEST-L')
      .set(auth(cashier))
      .expect(200);
    expect(found.body.found).toBe(true);
    expect(found.body.product.id).toBe(large.id);
    expect(found.body.product.variantName).toBe('Large');
    expect(found.body.product.sellingPrice).toBe('45.00');
  });

  it('rejects two sizes with the same label', async () => {
    const id = await base();
    await addSize(id, {
      variantName: 'Large',
      baseVariantName: 'Small',
      sku: 'SZ-L-007',
      costPrice: '20.00',
      sellingPrice: '45.00',
    }).expect(201);

    const res = await addSize(id, {
      variantName: 'large',
      sku: 'SZ-L-008',
      costPrice: '20.00',
      sellingPrice: '45.00',
    }).expect(409);
    expect(res.body.message).toMatch(/already has a large size/i);
  });

  it('rejects a size priced below its cost', async () => {
    const id = await base();
    await addSize(id, {
      variantName: 'Large',
      baseVariantName: 'Small',
      sku: 'SZ-L-009',
      costPrice: '50.00',
      sellingPrice: '10.00',
    }).expect(400);
  });

  it('renames a size', async () => {
    const id = await base();
    const res = await addSize(id, {
      variantName: 'Large',
      baseVariantName: 'Small',
      sku: 'SZ-L-010',
      costPrice: '20.00',
      sellingPrice: '45.00',
    }).expect(201);
    const large = res.body.variants.find(
      (v: { variantName: string }) => v.variantName === 'Large',
    );

    await http()
      .patch(`/api/v1/products/${large.id}/variant`)
      .set(auth(admin))
      .send({ variantName: '400ml' })
      .expect(200);

    const after = await prisma.product.findUniqueOrThrow({ where: { id: large.id } });
    expect(after.variantName).toBe('400ml');
  });

  it('separating one of two sizes leaves neither in a group', async () => {
    const id = await base();
    const res = await addSize(id, {
      variantName: 'Large',
      baseVariantName: 'Small',
      sku: 'SZ-L-011',
      costPrice: '20.00',
      sellingPrice: '45.00',
    }).expect(201);
    const large = res.body.variants.find(
      (v: { variantName: string }) => v.variantName === 'Large',
    );

    await http().delete(`/api/v1/products/${large.id}/variant`).set(auth(admin)).expect(200);

    // A group of one is not a set of sizes, so the survivor is ungrouped too.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: large.id } })).variantGroupId)
      .toBeNull();
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).variantGroupId).toBeNull();
  });

  it('a cashier may not add a size', async () => {
    const id = await base();
    await http()
      .post(`/api/v1/products/${id}/variants`)
      .set(auth(cashier))
      .send({
        variantName: 'Large',
        baseVariantName: 'Small',
        sku: 'SZ-L-012',
        costPrice: '20.00',
        sellingPrice: '45.00',
      })
      .expect(403);
  });
});
