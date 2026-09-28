import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('audit')
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  @ApiOperation({ summary: 'Browse the audit log' })
  async list(
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const take = Math.min(Number.parseInt(pageSize, 10) || 50, 200);
    const skip = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * take;

    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(userId ? { userId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    return {
      data: logs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        summary: l.summary,
        metadata: l.metadata,
        ipAddress: l.ipAddress,
        user: l.user ? `${l.user.firstName} ${l.user.lastName}` : 'System',
        createdAt: l.createdAt.toISOString(),
      })),
      meta: { page: Number(page), pageSize: take, total, pages: Math.ceil(total / take) },
    };
  }

  /** Distinct action names, for populating the filter dropdown. */
  @Get('actions')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  async actions() {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    return { data: rows.map((r) => r.action) };
  }
}
