import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

@ApiTags('categories')
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATEGORY_VIEW)
  @ApiOperation({ summary: 'List categories with product counts' })
  async list(@Query('includeInactive') includeInactive?: string) {
    const categories = await this.prisma.category.findMany({
      where: includeInactive === 'true' ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });

    return {
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        productCount: c._count.products,
      })),
    };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATEGORY_MANAGE)
  @ApiOperation({ summary: 'Create a category' })
  async create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: slugify(dto.name),
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'CATEGORY_CREATED',
      entityType: 'Category',
      entityId: category.id,
      summary: `${user.firstName} ${user.lastName} created category ${category.name}`,
    });

    return category;
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATEGORY_MANAGE)
  @ApiOperation({ summary: 'Update or deactivate a category' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const existing = await this.prisma.category.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });

    // Deactivating a category would orphan the products still filed under it
    // on the POS, so block it until they are moved.
    if (dto.isActive === false && existing._count.products > 0) {
      throw new BadRequestException(
        `${existing.name} still has ${existing._count.products} active product(s). Move or deactivate them first.`,
      );
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name, slug: slugify(dto.name) } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: dto.isActive === false ? 'CATEGORY_DEACTIVATED' : 'CATEGORY_UPDATED',
      entityType: 'Category',
      entityId: category.id,
      summary: `${user.firstName} ${user.lastName} ${dto.isActive === false ? 'deactivated' : 'updated'} category ${category.name}`,
    });

    return category;
  }
}
