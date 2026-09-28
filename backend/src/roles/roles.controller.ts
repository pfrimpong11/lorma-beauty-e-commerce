import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS, PERMISSION_DESCRIPTIONS, type PermissionCode } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('roles')
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_VIEW)
  @ApiOperation({ summary: 'List roles with their permissions' })
  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    });

    return {
      data: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => p.permission.code),
      })),
    };
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @ApiOperation({ summary: 'The full permission catalogue' })
  async permissions() {
    const permissions = await this.prisma.permission.findMany({ orderBy: { code: 'asc' } });

    return {
      data: permissions.map((p) => ({
        code: p.code,
        description: p.description ?? PERMISSION_DESCRIPTIONS[p.code as PermissionCode],
        // resource.action -> group screens by resource
        group: p.code.split('.')[0],
      })),
    };
  }
}
