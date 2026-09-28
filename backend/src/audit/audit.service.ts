import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only record of business-significant actions (§33).
 *
 * Two rules shape this service:
 *   1. Writing an audit row must never fail the action it describes — a
 *      logging outage cannot block a sale.
 *   2. When the caller supplies a transaction client, the audit row joins
 *      that transaction, so a rolled-back sale leaves no audit trace.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Write inside an existing transaction — succeeds or rolls back with it. */
  async recordInTransaction(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: this.toRow(entry) });
  }

  /** Fire-and-forget write for actions outside a transaction. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.toRow(entry) });
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry for ${entry.action} on ${entry.entityType}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private toRow(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary.slice(0, 500),
      metadata: entry.metadata,
      ipAddress: entry.ipAddress?.slice(0, 64) ?? null,
      userAgent: entry.userAgent?.slice(0, 300) ?? null,
    };
  }
}
