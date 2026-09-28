import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetTransactions } from './setup';
import { receiptSms } from '../src/sms/sms.service';
import { normaliseGhanaPhone } from '../src/sms/phone';

/**
 * Capturing a walk-in customer and texting them the receipt.
 *
 * The rule that matters most is the one about failure: the money is taken
 * and the stock is gone before any message is attempted, so nothing here
 * may undo a sale.
 */
describe('Receipt SMS and customer capture (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => ReturnType<typeof request>;

  let cashier: string;
  let productId: string;
  let unitPrice: number;

  const login = async (email: string, password: string): Promise<string> => {
    const res = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.body.accessToken as string;
  };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const sell = (body: Record<string, unknown>) =>
    http().post('/api/v1/sales').set(auth(cashier)).send(body);

  const simple = (extra: Record<string, unknown> = {}) => ({
    items: [{ productId, quantity: 1 }],
    payments: [
      { method: 'CASH', amount: unitPrice.toFixed(2), amountTendered: unitPrice.toFixed(2) },
    ],
    ...extra,
  });

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    http = () => request(app.getHttpServer());
    cashier = await login('cashier@lormabeauty.local', 'LormaCashier!2024');

    const product = await prisma.product.findFirstOrThrow({
      where: { tracksExpiry: false, isActive: true },
      include: { inventory: true },
    });
    productId = product.id;
    unitPrice = Number(product.sellingPrice);
  });

  beforeEach(async () => {
    await resetTransactions(prisma);
    await prisma.smsMessage.deleteMany();
    await prisma.customer.deleteMany({ where: { isWalkIn: false, phone: { startsWith: '2332' } } });
    await prisma.inventory.update({ where: { productId }, data: { quantity: 500 } });
  });

  afterAll(async () => {
    await app.close();
  });

  // --- the message itself --------------------------------------------------

  it('reads exactly as specified for a single product', () => {
    expect(
      receiptSms({ itemNames: ['Vaseline Cocoa Radiant'], amount: '45.00', receiptNumber: 'LMB-000021' }),
    ).toBe(
      'Lorma Beauty: Thank you for your purchase! Your order of Vaseline Cocoa Radiant ' +
        'for GHS 45.00 was successful. Ref: LMB-000021. Thank you for choosing Lorma Beauty! 💕',
    );
  });

  it('describes a basket of several without naming only the first', () => {
    const body = receiptSms({
      itemNames: ['Shea Butter', 'Face Toner', 'Lip Balm'],
      amount: '90.00',
      receiptNumber: 'LMB-000022',
    });
    expect(body).toContain('Shea Butter and 2 more items');
  });

  it('says "item" not "items" when there is one more', () => {
    const body = receiptSms({ itemNames: ['A', 'B'], amount: '1.00', receiptNumber: 'R' });
    expect(body).toContain('A and 1 more item for GHS');
  });

  // --- phone numbers -------------------------------------------------------

  it.each([
    ['024 123 4567', '233241234567'],
    ['0241234567', '233241234567'],
    ['+233241234567', '233241234567'],
    ['233241234567', '233241234567'],
    ['241234567', '233241234567'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normaliseGhanaPhone(input)?.e164).toBe(expected);
  });

  it.each(['012345', '0111234567', 'not a phone', ''])('rejects %s', (input) => {
    expect(normaliseGhanaPhone(input)).toBeNull();
  });

  // --- capture -------------------------------------------------------------

  it('creates a customer from a number given at the till', async () => {
    const res = await sell(simple({ customerPhone: '024 111 2222' })).expect(201);

    const customer = await prisma.customer.findUnique({ where: { phone: '233241112222' } });
    expect(customer).not.toBeNull();
    expect(res.body.customer.phone).toBe('233241112222');
  });

  it('does not duplicate a customer who comes back', async () => {
    await sell(simple({ customerPhone: '0241112222' })).expect(201);
    await sell(simple({ customerPhone: '+233241112222' })).expect(201);

    // Same person, written three ways — one record, or the customer list
    // fills with duplicates of the same human being.
    expect(await prisma.customer.count({ where: { phone: '233241112222' } })).toBe(1);
  });

  it('rejects a number that is not a Ghanaian mobile', async () => {
    const res = await sell(simple({ customerPhone: '0111234567' })).expect(400);
    expect(res.body.message).toMatch(/not a Ghanaian mobile/i);
  });

  it('a sale with no number still completes, against the walk-in customer', async () => {
    const res = await sell(simple()).expect(201);
    expect(res.body.customer.isWalkIn).toBe(true);
    expect(await prisma.smsMessage.count()).toBe(0);
  });

  // --- the message record --------------------------------------------------

  it('records the message against the sale', async () => {
    const res = await sell(simple({ customerPhone: '024 111 2222' })).expect(201);

    // Sending is deliberately not awaited by the sale, so the record may
    // land a moment later.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const message = await prisma.smsMessage.findFirst({ where: { saleId: res.body.id } });
    expect(message).not.toBeNull();
    expect(message?.toPhone).toBe('233241112222');
    expect(message?.body).toContain(res.body.receiptNumber);
    expect(message?.body).toContain('Lorma Beauty');
  });

  it('records it as queued when no provider is configured', async () => {
    const res = await sell(simple({ customerPhone: '024 111 2222' })).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Queued, not failed: it is a real message waiting for a gateway.
    const message = await prisma.smsMessage.findFirstOrThrow({ where: { saleId: res.body.id } });
    expect(message.status).toBe('QUEUED');
    expect(message.provider).toBeNull();
  });

  it('a name can be given with the number', async () => {
    await sell(simple({ customerPhone: '024 111 2222', customerName: 'Ama Mensah' })).expect(201);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone: '233241112222' } });
    expect(customer.name).toBe('Ama Mensah');
  });

  it('names the customer by their number when none is given', async () => {
    await sell(simple({ customerPhone: '024 111 2222' })).expect(201);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone: '233241112222' } });
    expect(customer.name).toBe('Customer 0241112222');
  });
});
