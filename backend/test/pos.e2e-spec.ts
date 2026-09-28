import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetTransactions } from './setup';

/**
 * The 16 critical scenarios from PROMPT.md §46, exercised against a real
 * PostgreSQL database through the real application graph — no mocks, so
 * transactions, constraints and the idempotency ledger are all genuinely
 * under test.
 */
describe('Lorma Beauty POS (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => ReturnType<typeof request>;

  let adminToken: string;
  let cashierToken: string;
  let productId: string;
  let productName: string;
  let unitPrice: number;

  const login = async (email: string, password: string): Promise<string> => {
    const response = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    http = () => request(app.getHttpServer());

    adminToken = await login('admin@lormabeauty.local', 'LormaAdmin!2024');
    cashierToken = await login('cashier@lormabeauty.local', 'LormaCashier!2024');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTransactions(prisma);

    // A product with plenty of stock and a healthy expiry date.
    const product = await prisma.product.findFirstOrThrow({
      where: { sku: 'LMB-SER-002' },
      include: { inventory: true },
    });
    productId = product.id;
    productName = product.name;
    unitPrice = Number.parseFloat(product.sellingPrice.toFixed(2));

    await prisma.inventory.update({
      where: { productId },
      data: { quantity: 100 },
    });

    // Restore the expiry date as well as the quantity: the expired-stock
    // test mutates it, and any test declared after it would otherwise
    // inherit a product that can never be sold.
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 2);
    await prisma.productBatch.updateMany({
      where: { productId },
      data: { quantity: 100, expiryDate: farFuture },
    });
  });

  const stockOf = async (id = productId): Promise<number> =>
    (await prisma.inventory.findUniqueOrThrow({ where: { productId: id } })).quantity;

  const sale = (token: string, body: Record<string, unknown>, idempotencyKey?: string) => {
    const req = http().post('/api/v1/sales').set('Authorization', `Bearer ${token}`);
    if (idempotencyKey) req.set('X-Idempotency-Key', idempotencyKey);
    return req.send(body);
  };

  const simpleSale = (quantity: number) => ({
    items: [{ productId, quantity }],
    payments: [
      {
        method: 'CASH',
        amount: (unitPrice * quantity).toFixed(2),
        // Required: a cash sale must record what was handed over.
        amountTendered: (unitPrice * quantity).toFixed(2),
      },
    ],
  });

  // --- 1, 4 ---------------------------------------------------------------
  it('1 & 4: completes a sale and records the payment correctly', async () => {
    const response = await sale(cashierToken, simpleSale(2)).expect(201);

    expect(response.body.receiptNumber).toMatch(/^LMB-\d{6}$/);
    expect(response.body.total).toBe((unitPrice * 2).toFixed(2));
    expect(response.body.payments).toHaveLength(1);
    expect(response.body.payments[0].method).toBe('CASH');
    expect(response.body.payments[0].amount).toBe((unitPrice * 2).toFixed(2));
    expect(response.body.status).toBe('COMPLETED');
  });

  // --- cash must be accounted for ------------------------------------------
  /*
   * The till disabled its button, which is not the same as enforcing a rule:
   * a stale cached bundle, a replayed offline sale or any other caller went
   * straight past it and completed a cash sale with no record of the cash.
   */
  it('refuses a cash sale that does not say what was handed over', async () => {
    const res = await sale(cashierToken, {
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'CASH', amount: unitPrice.toFixed(2) }],
    }).expect(400);

    expect(res.body.message).toMatch(/cash tendered is required/i);
  });

  it('leaves stock untouched when it refuses one', async () => {
    const before = await stockOf();
    await sale(cashierToken, {
      items: [{ productId, quantity: 3 }],
      payments: [{ method: 'CASH', amount: (unitPrice * 3).toFixed(2) }],
    }).expect(400);

    expect(await stockOf()).toBe(before);
  });

  it('still refuses cash that is short', async () => {
    await sale(cashierToken, {
      items: [{ productId, quantity: 1 }],
      payments: [
        { method: 'CASH', amount: unitPrice.toFixed(2), amountTendered: (unitPrice - 1).toFixed(2) },
      ],
    }).expect(400);
  });

  it('records the change owed when the tender is over', async () => {
    const res = await sale(cashierToken, {
      items: [{ productId, quantity: 1 }],
      payments: [
        { method: 'CASH', amount: unitPrice.toFixed(2), amountTendered: (unitPrice + 20).toFixed(2) },
      ],
    }).expect(201);

    expect(res.body.payments[0].amountTendered).toBe((unitPrice + 20).toFixed(2));
    expect(res.body.payments[0].changeGiven).toBe('20.00');
  });

  it('a non-cash method needs no tendered amount', async () => {
    // Nothing was handed over, so there is nothing to record.
    await sale(cashierToken, {
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'MOBILE_MONEY', amount: unitPrice.toFixed(2) }],
    }).expect(201);
  });

  // --- 2 -------------------------------------------------------------------
  it('2: a sale reduces inventory and writes a movement', async () => {
    const before = await stockOf();
    await sale(cashierToken, simpleSale(3)).expect(201);

    expect(await stockOf()).toBe(before - 3);

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { productId, type: 'SALE' },
    });
    expect(movement.quantity).toBe(-3);
    expect(movement.previousQty).toBe(before);
    expect(movement.newQty).toBe(before - 3);
    expect(movement.reason).toContain('LMB-');
  });

  // --- 3 -------------------------------------------------------------------
  it('3: a sale cannot exceed available inventory', async () => {
    const before = await stockOf();

    const response = await sale(cashierToken, simpleSale(before + 1)).expect(400);

    expect(response.body.code).toBe('INSUFFICIENT_STOCK');
    // The whole transaction rolls back — no partial deduction.
    expect(await stockOf()).toBe(before);
    expect(await prisma.sale.count()).toBe(0);
  });

  // --- 5 -------------------------------------------------------------------
  it('5: a return restocks inventory and never rewrites the original sale', async () => {
    const created = await sale(cashierToken, simpleSale(4)).expect(201);
    const afterSale = await stockOf();
    const saleItemId = created.body.items[0].id as string;

    const refund = await http()
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        saleId: created.body.id,
        items: [{ saleItemId, quantity: 2 }],
        reason: 'CUSTOMER_CHANGED_MIND',
        refundMethod: 'CASH',
      })
      .expect(201);

    expect(refund.body.returnNumber).toMatch(/^RET-\d{6}$/);
    expect(await stockOf()).toBe(afterSale + 2);

    const original = await prisma.sale.findUniqueOrThrow({ where: { id: created.body.id } });
    // The sale's own figures are untouched; only the rollup changed.
    expect(original.total.toFixed(2)).toBe((unitPrice * 4).toFixed(2));
    expect(original.amountRefunded.toFixed(2)).toBe((unitPrice * 2).toFixed(2));
    expect(original.status).toBe('PARTIALLY_RETURNED');
  });

  it('5b: cannot return more units than were sold', async () => {
    const created = await sale(cashierToken, simpleSale(1)).expect(201);

    await http()
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        saleId: created.body.id,
        items: [{ saleItemId: created.body.items[0].id, quantity: 5 }],
        reason: 'OTHER',
        refundMethod: 'CASH',
      })
      .expect(400);
  });

  // --- 6, 7, 8 -------------------------------------------------------------
  it('6, 7 & 8: opens a shift, closes it and computes the cash variance', async () => {
    const opened = await http()
      .post('/api/v1/shifts/open')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ openingCash: '500.00' })
      .expect(201);

    expect(opened.body.shiftNumber).toMatch(/^SH-\d{6}$/);

    await sale(cashierToken, simpleSale(2)).expect(201);
    const cashTaken = unitPrice * 2;
    const expectedCash = 500 + cashTaken;

    // A material variance without an explanation is refused.
    const refused = await http()
      .post(`/api/v1/shifts/${opened.body.id}/close`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ closingCash: (expectedCash - 50).toFixed(2) })
      .expect(400);
    expect(refused.body.code).toBe('VARIANCE_REASON_REQUIRED');

    const closed = await http()
      .post(`/api/v1/shifts/${opened.body.id}/close`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ closingCash: (expectedCash - 50).toFixed(2), varianceReason: 'Cash drop to safe' })
      .expect(201);

    expect(closed.body.expectedCash).toBe(expectedCash.toFixed(2));
    expect(closed.body.variance).toBe('-50.00');
    expect(closed.body.status).toBe('CLOSED');
  });

  it('6b: a cashier cannot hold two open shifts (§51.15)', async () => {
    await http()
      .post('/api/v1/shifts/open')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ openingCash: '100.00' })
      .expect(201);

    await http()
      .post('/api/v1/shifts/open')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ openingCash: '100.00' })
      .expect(409);
  });

  // --- 9 -------------------------------------------------------------------
  it('9: role authorization is enforced per permission', async () => {
    // A cashier may sell...
    await sale(cashierToken, simpleSale(1)).expect(201);

    // ...but not change prices, manage staff, or adjust stock freely.
    await http()
      .patch(`/api/v1/products/${productId}/price`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ sellingPrice: '1.00', reason: 'attempt' })
      .expect(403);

    await http().get('/api/v1/users').set('Authorization', `Bearer ${cashierToken}`).expect(403);

    await http()
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ productId, newQuantity: 999, reason: 'attempt' })
      .expect(403);

    // The admin may do all of it.
    await http()
      .patch(`/api/v1/products/${productId}/price`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sellingPrice: (unitPrice + 5).toFixed(2), reason: 'Supplier increase' })
      .expect(200);
  });

  // --- 10, 11 --------------------------------------------------------------
  it('10 & 11: an offline sale syncs through the queue endpoint', async () => {
    const clientUuid = crypto.randomUUID();
    const before = await stockOf();

    const response = await http()
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        sales: [
          {
            idempotencyKey: `till-01:${clientUuid}`,
            clientUuid,
            deviceId: 'till-01',
            clientSequence: 1,
            clientTime: new Date().toISOString(),
            sale: simpleSale(2),
          },
        ],
      })
      .expect(201);

    expect(response.body.summary.accepted).toBe(1);
    expect(response.body.results[0].receiptNumber).toMatch(/^LMB-\d{6}$/);
    expect(await stockOf()).toBe(before - 2);

    const stored = await prisma.sale.findFirstOrThrow({ where: { clientUuid } });
    expect(stored.origin).toBe('OFFLINE_SYNCED');
    expect(stored.deviceId).toBe('till-01');
  });

  // --- 12 ------------------------------------------------------------------
  it('12: replaying the same sync batch does not create a duplicate sale', async () => {
    const clientUuid = crypto.randomUUID();
    const before = await stockOf();

    const body = {
      sales: [
        {
          idempotencyKey: `till-01:${clientUuid}`,
          clientUuid,
          deviceId: 'till-01',
          clientSequence: 1,
          clientTime: new Date().toISOString(),
          sale: simpleSale(3),
        },
      ],
    };

    const first = await http()
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(body)
      .expect(201);

    const second = await http()
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(body)
      .expect(201);

    expect(first.body.summary.accepted).toBe(1);
    expect(second.body.summary.duplicate).toBe(1);
    expect(second.body.results[0].receiptNumber).toBe(first.body.results[0].receiptNumber);

    // The decisive assertions: one sale, one stock deduction.
    expect(await prisma.sale.count()).toBe(1);
    expect(await stockOf()).toBe(before - 3);
  });

  it('12b: a direct retry with the same idempotency key returns the original sale', async () => {
    const key = `till-02:${crypto.randomUUID()}`;
    const before = await stockOf();

    const first = await sale(cashierToken, simpleSale(2), key).expect(201);
    const retry = await sale(cashierToken, simpleSale(2), key).expect(201);

    expect(retry.body.receiptNumber).toBe(first.body.receiptNumber);
    expect(retry.body.duplicate).toBe(true);
    expect(await prisma.sale.count()).toBe(1);
    expect(await stockOf()).toBe(before - 2);
  });

  it('12c: the same clientUuid cannot produce two sales', async () => {
    const clientUuid = crypto.randomUUID();
    const before = await stockOf();

    await sale(cashierToken, { ...simpleSale(1), clientUuid }).expect(201);
    const second = await sale(cashierToken, { ...simpleSale(1), clientUuid }).expect(201);

    expect(second.body.duplicate).toBe(true);
    expect(await prisma.sale.count()).toBe(1);
    expect(await stockOf()).toBe(before - 1);
  });

  // --- 13 ------------------------------------------------------------------
  it('13: a sale that cannot be applied is preserved as a conflict, not lost', async () => {
    await prisma.inventory.update({ where: { productId }, data: { quantity: 1 } });

    const clientUuid = crypto.randomUUID();
    const response = await http()
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        sales: [
          {
            idempotencyKey: `till-03:${clientUuid}`,
            clientUuid,
            deviceId: 'till-03',
            clientSequence: 1,
            clientTime: new Date().toISOString(),
            sale: simpleSale(10),
          },
        ],
      })
      .expect(201);

    expect(response.body.summary.conflict).toBe(1);

    // §51.9 — the completed offline sale is kept, with its payload, for
    // an authorised user to resolve.
    const entry = await prisma.syncQueueEntry.findFirstOrThrow({ where: { clientUuid } });
    expect(entry.status).toBe('CONFLICT');
    expect(entry.payload).toBeTruthy();
    expect(entry.errorMessage).toContain('Not enough stock');
  });

  it('13b: one bad entry does not block the rest of the batch', async () => {
    await prisma.inventory.update({ where: { productId }, data: { quantity: 5 } });

    const bad = crypto.randomUUID();
    const good = crypto.randomUUID();
    const now = new Date().toISOString();

    const response = await http()
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        sales: [
          { idempotencyKey: `t:${bad}`, clientUuid: bad, deviceId: 't', clientSequence: 1, clientTime: now, sale: simpleSale(99) },
          { idempotencyKey: `t:${good}`, clientUuid: good, deviceId: 't', clientSequence: 2, clientTime: now, sale: simpleSale(2) },
        ],
      })
      .expect(201);

    expect(response.body.summary.conflict).toBe(1);
    expect(response.body.summary.accepted).toBe(1);
    expect(await prisma.sale.count()).toBe(1);
  });

  // --- 14, 15 --------------------------------------------------------------
  it('14: authentication failure is rejected without revealing why', async () => {
    const wrongPassword = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'admin@lormabeauty.local', password: 'WrongPassword123' })
      .expect(401);

    const unknownEmail = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@lormabeauty.local', password: 'WrongPassword123' })
      .expect(401);

    // Identical wording, so the form cannot be used to enumerate accounts.
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('15: unauthorized access is refused', async () => {
    await http().get('/api/v1/sales').expect(401);
    await http().get('/api/v1/auth/me').expect(401);
    await http().get('/api/v1/sales').set('Authorization', 'Bearer not-a-real-token').expect(401);
  });

  // --- 16 ------------------------------------------------------------------
  it('16: expired stock cannot be sold (§51.3)', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // All sellable stock for this product is now expired.
    await prisma.productBatch.updateMany({
      where: { productId },
      data: { expiryDate: yesterday, quantity: 50 },
    });
    await prisma.inventory.update({ where: { productId }, data: { quantity: 50 } });

    const response = await sale(cashierToken, simpleSale(1)).expect(400);

    expect(response.body.code).toBe('PRODUCT_EXPIRED');
    expect(response.body.message).toContain('expired');
    expect(await prisma.sale.count()).toBe(0);
    expect(await stockOf()).toBe(50);
  });

  // --- integrity ------------------------------------------------------------
  it('rejects a payment that does not match the computed total', async () => {
    const response = await sale(cashierToken, {
      items: [{ productId, quantity: 2 }],
      payments: [{ method: 'CASH', amount: '1.00', amountTendered: '1.00' }],
    }).expect(400);

    expect(response.body.message).toContain('does not match');
    expect(await prisma.sale.count()).toBe(0);
  });

  it('computes discounts in decimal without drift', async () => {
    const response = await sale(cashierToken, {
      items: [{ productId, quantity: 3 }],
      discountType: 'PERCENT',
      discountValue: '10',
      payments: [
          {
            method: 'CASH',
            amount: (unitPrice * 3 * 0.9).toFixed(2),
            amountTendered: (unitPrice * 3 * 0.9).toFixed(2),
          },
        ],
    }).expect(201);

    expect(response.body.subtotal).toBe((unitPrice * 3).toFixed(2));
    expect(response.body.discountAmount).toBe((unitPrice * 3 * 0.1).toFixed(2));
    expect(response.body.total).toBe((unitPrice * 3 * 0.9).toFixed(2));
  });

  it('writes an audit entry for every completed sale (§33)', async () => {
    const created = await sale(cashierToken, simpleSale(1)).expect(201);

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'SALE_COMPLETED', entityId: created.body.id },
    });
    expect(entry.summary).toContain(created.body.receiptNumber);
    expect(entry.userId).toBeTruthy();
  });

  it('finds a sale by receipt number, however it is typed', async () => {
    const created = await sale(cashierToken, simpleSale(1)).expect(201);
    const receipt = created.body.receiptNumber as string;

    // A cashier holding a printed slip types whatever is quickest.
    for (const term of [receipt, receipt.replace('LMB-', ''), receipt.slice(-2)]) {
      const res = await http()
        .get(`/api/v1/sales?search=${encodeURIComponent(term)}`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(res.body.data.some((s: { receiptNumber: string }) => s.receiptNumber === receipt)).toBe(
        true,
      );
    }
  });

  it('returns nothing for a receipt that does not exist', async () => {
    await sale(cashierToken, simpleSale(1)).expect(201);

    const res = await http()
      .get('/api/v1/sales?search=LMB-999999')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);

    expect(res.body.meta.total).toBe(0);
  });

  it('reports the database in its health check', async () => {
    const response = await http().get('/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBe('up');
  });
});
