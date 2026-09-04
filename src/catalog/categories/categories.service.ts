import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaClient } from '../../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../../common/prisma/prisma.constants';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.create({
      data: { tenantId: this.currentTenant.tenantId, name: dto.name },
    });
    return CategoryResponseDto.fromEntity(category);
  }

  async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return categories.map(CategoryResponseDto.fromEntity);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.category.update({ where: { id }, data: { name: dto.name } });
    return CategoryResponseDto.fromEntity(updated);
  }

  /**
   * No soft-delete flag on Category in the schema. Product.categoryId is an
   * optional field with no explicit onDelete in the schema, so Prisma's
   * generated migration defaults it to ON DELETE SET NULL (verified against
   * the actual migration SQL, not assumed) — products in this category
   * become uncategorized rather than blocking the delete.
   */
  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.category.delete({ where: { id } });
  }

  private async findOrThrow(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Категория не найдена.');
    }
    return category;
  }
}
