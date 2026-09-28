import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShiftStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';

@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_VIEW)
  @ApiOperation({ summary: 'List staff' })
  async list(@Query('includeInactive') includeInactive?: string) {
    const users = await this.prisma.user.findMany({
      where: includeInactive === 'true' ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
      include: { role: { select: { id: true, name: true } } },
    });

    // passwordHash and tokenVersion are never serialised.
    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.USER_VIEW)
  @ApiOperation({ summary: 'Recent activity for a staff member' })
  async activity(@Param('id', ParseUUIDPipe) id: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, action: true, entityType: true, summary: true, createdAt: true },
    });

    return {
      data: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Add a staff member' })
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    const rounds = this.config.get<number>('bcryptRounds') ?? 12;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, rounds),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        roleId: dto.roleId,
        // The creator knows this password, so force a change on first login.
        mustChangePassword: true,
      },
      include: { role: { select: { id: true, name: true } } },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      summary: `${actor.firstName} ${actor.lastName} added staff member ${user.firstName} ${user.lastName} (${user.role.name})`,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
    };
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Update or deactivate a staff member' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const existing = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: { role: true },
    });

    if (dto.isActive === false) {
      // Locking out a cashier mid-shift would strand the cash count.
      const openShift = await this.prisma.shift.findFirst({
        where: { cashierId: id, status: ShiftStatus.OPEN },
        select: { shiftNumber: true },
      });
      if (openShift) {
        throw new BadRequestException(
          `${existing.firstName} still has shift ${openShift.shiftNumber} open. Close it before deactivating them.`,
        );
      }
      if (id === actor.id) {
        throw new BadRequestException('You cannot deactivate your own account.');
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.isActive === false
          ? // Invalidate every refresh token this user holds.
            { deactivatedAt: new Date(), tokenVersion: { increment: 1 } }
          : {}),
        ...(dto.isActive === true ? { deactivatedAt: null } : {}),
      },
      include: { role: { select: { id: true, name: true } } },
    });

    await this.audit.record({
      userId: actor.id,
      action: dto.isActive === false ? 'USER_DEACTIVATED' : 'USER_UPDATED',
      entityType: 'User',
      entityId: user.id,
      summary:
        dto.roleId && dto.roleId !== existing.roleId
          ? `${actor.firstName} ${actor.lastName} changed ${user.firstName} ${user.lastName}'s role from ${existing.role.name} to ${user.role.name}`
          : `${actor.firstName} ${actor.lastName} ${dto.isActive === false ? 'deactivated' : 'updated'} ${user.firstName} ${user.lastName}`,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
    };
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset a staff password' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, rounds),
        mustChangePassword: true,
        // Signs the user out of every device immediately.
        tokenVersion: { increment: 1 },
      },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: id,
      summary: `${actor.firstName} ${actor.lastName} reset the password for ${target.firstName} ${target.lastName}`,
    });
  }
}
