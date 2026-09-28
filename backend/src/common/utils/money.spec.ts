import { Prisma } from '@prisma/client';
import { add, atLeastZero, eq, gt, money, multiply, percentOf, subtract, toMoneyString } from './money';

describe('money', () => {
  it('never reproduces float error', () => {
    // The reason this module exists: 0.1 + 0.2 === 0.30000000000000004 in
    // IEEE-754, and a POS that drifts cannot reconcile a cash drawer.
    expect(add('0.10', '0.20').toFixed(2)).toBe('0.30');
    expect(add('0.1', '0.2').equals(new Prisma.Decimal('0.3'))).toBe(true);
  });

  it('keeps precision across many additions', () => {
    let total = money(0);
    for (let i = 0; i < 1000; i++) total = add(total, '0.01');
    expect(total.toFixed(2)).toBe('10.00');
  });

  it('rounds half-up at two decimal places', () => {
    expect(money('1.005').toFixed(2)).toBe('1.01');
    expect(money('1.004').toFixed(2)).toBe('1.00');
    expect(money('2.675').toFixed(2)).toBe('2.68');
  });

  it('multiplies a unit price by a quantity exactly', () => {
    expect(multiply('19.99', 3).toFixed(2)).toBe('59.97');
    expect(multiply('0.07', 100).toFixed(2)).toBe('7.00');
  });

  it('computes percentage discounts', () => {
    expect(percentOf('200.00', 10).toFixed(2)).toBe('20.00');
    expect(percentOf('99.99', 33).toFixed(2)).toBe('33.00');
  });

  it('subtracts without drift', () => {
    expect(subtract('300.00', '20.00').toFixed(2)).toBe('280.00');
  });

  it('clamps negatives to zero', () => {
    expect(atLeastZero('-5.00').toFixed(2)).toBe('0.00');
    expect(atLeastZero('5.00').toFixed(2)).toBe('5.00');
  });

  it('compares by value, not object identity', () => {
    expect(eq(money('10.00'), money('10.000'))).toBe(true);
    expect(gt('10.01', '10.00')).toBe(true);
    expect(gt('10.00', '10.00')).toBe(false);
  });

  it('serialises at fixed scale so JSON never yields a float', () => {
    expect(toMoneyString('5')).toBe('5.00');
    expect(toMoneyString(5.5)).toBe('5.50');
    expect(typeof toMoneyString('5')).toBe('string');
  });
});
