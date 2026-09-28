import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type CounterName = 'receipt' | 'return' | 'shift' | 'stockcount';

const PREFIXES: Record<CounterName, string> = {
  receipt: 'LMB',
  return: 'RET',
  shift: 'SH',
  stockcount: 'SC',
};

/**
 * Human-facing document numbers (LMB-000001, RET-000001, SH-000001).
 *
 * The increment happens inside the caller's transaction via an atomic
 * `UPDATE ... RETURNING`, so two concurrent sales can never be handed the
 * same receipt number, and a rolled-back sale does not burn one.
 */
@Injectable()
export class CounterService {
  async next(tx: Prisma.TransactionClient, name: CounterName): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ value: number }>>`
      UPDATE "counters"
         SET "value" = "value" + 1, "updatedAt" = NOW()
       WHERE "name" = ${name}
      RETURNING "value"
    `;

    if (rows.length === 0) {
      throw new Error(`Counter "${name}" is missing. Run the database seed.`);
    }

    return `${PREFIXES[name]}-${String(rows[0].value).padStart(6, '0')}`;
  }
}
