import { Prisma } from '@prisma/client';

/**
 * Money handling for Lorma Beauty POS.
 *
 * Every monetary value in this system is a Prisma.Decimal backed by a
 * PostgreSQL NUMERIC(12,2) column. Floating point is never used for money:
 * 0.1 + 0.2 !== 0.3 in IEEE-754, and a POS that drifts by a pesewa per line
 * produces shift variances nobody can explain.
 *
 * See docs/adr/0002-money.md
 */

export type MoneyInput = Prisma.Decimal | string | number;

/** Scale every monetary value is stored and compared at. */
export const MONEY_SCALE = 2;

export function money(value: MoneyInput): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export const ZERO = (): Prisma.Decimal => money(0);

export function add(...values: MoneyInput[]): Prisma.Decimal {
  return money(values.reduce<Prisma.Decimal>((sum, v) => sum.add(new Prisma.Decimal(v)), new Prisma.Decimal(0)));
}

export function subtract(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return money(new Prisma.Decimal(a).sub(new Prisma.Decimal(b)));
}

export function multiply(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return money(new Prisma.Decimal(a).mul(new Prisma.Decimal(b)));
}

/** Percentage of an amount, e.g. percentOf(200, 10) -> 20.00 */
export function percentOf(amount: MoneyInput, percent: MoneyInput): Prisma.Decimal {
  return money(new Prisma.Decimal(amount).mul(new Prisma.Decimal(percent)).div(100));
}

export function isNegative(value: MoneyInput): boolean {
  return new Prisma.Decimal(value).isNegative();
}

export function gt(a: MoneyInput, b: MoneyInput): boolean {
  return new Prisma.Decimal(a).greaterThan(new Prisma.Decimal(b));
}

export function gte(a: MoneyInput, b: MoneyInput): boolean {
  return new Prisma.Decimal(a).greaterThanOrEqualTo(new Prisma.Decimal(b));
}

export function eq(a: MoneyInput, b: MoneyInput): boolean {
  return new Prisma.Decimal(a).equals(new Prisma.Decimal(b));
}

/** Clamp to zero — refunds and totals must never go negative. */
export function atLeastZero(value: MoneyInput): Prisma.Decimal {
  const d = new Prisma.Decimal(value);
  return d.isNegative() ? ZERO() : money(d);
}

/** Serialise for JSON responses: a fixed-scale string, never a float. */
export function toMoneyString(value: MoneyInput): string {
  return money(value).toFixed(MONEY_SCALE);
}
