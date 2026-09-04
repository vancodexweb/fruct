import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';
import { TenantPrismaClient } from '../../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../../common/prisma/prisma.constants';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
  ) {}

  async create(dto: CreateProductDto): Promise<ProductResponseDto> {
    const product = await this.prisma.product.create({
      data: {
        tenantId: this.currentTenant.tenantId,
        name: dto.name,
        categoryId: dto.categoryId,
        sku: dto.sku,
        price: dto.price,
        costPrice: dto.costPrice,
        weightKg: dto.weightKg,
        specs: dto.specs as Prisma.InputJsonValue | undefined,
        imageUrls: dto.imageUrls ?? [],
      },
    });
    return ProductResponseDto.fromEntity(product);
  }

  async findAll(query: ListProductsQueryDto): Promise<ProductResponseDto[]> {
    const products = query.search
      ? await this.searchByRawQuery(query)
      : await this.prisma.product.findMany({
          where: {
            categoryId: query.categoryId,
            isActive: query.includeInactive ? undefined : true,
          },
          orderBy: { name: 'asc' },
          take: query.limit ?? 50,
          skip: query.offset ?? 0,
        });
    return products.map(ProductResponseDto.fromEntity);
  }

  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.findOrThrow(id);
    return ProductResponseDto.fromEntity(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        categoryId: dto.categoryId,
        sku: dto.sku,
        price: dto.price,
        costPrice: dto.costPrice,
        weightKg: dto.weightKg,
        specs: dto.specs as Prisma.InputJsonValue | undefined,
        imageUrls: dto.imageUrls,
      },
    });
    return ProductResponseDto.fromEntity(updated);
  }

  /** Soft delete: Stock cascade-deletes with its Product, so deactivating preserves history. */
  async deactivate(id: string): Promise<ProductResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.product.update({ where: { id }, data: { isActive: false } });
    return ProductResponseDto.fromEntity(updated);
  }

  async reactivate(id: string): Promise<ProductResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.product.update({ where: { id }, data: { isActive: true } });
    return ProductResponseDto.fromEntity(updated);
  }

  /** Used by StockService to confirm a productId actually belongs to the current tenant. */
  async findOrThrow(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Товар не найден.');
    }
    return product;
  }

  /**
   * `specs` is unstructured JSON (Product.specs Json?) — there's no indexed,
   * typed way to search inside it through Prisma's query builder, so this
   * falls back to a raw `::text ILIKE` scan. Prisma's tenant-scoping
   * extension only intercepts model queries (findMany/create/...), NOT
   * `$queryRaw` — so tenantId is filtered here BY HAND. Do not copy this
   * pattern without re-adding that filter.
   */
  private async searchByRawQuery(query: ListProductsQueryDto): Promise<Product[]> {
    const tenantId = this.currentTenant.tenantId;
    const pattern = `%${query.search}%`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`"tenantId" = ${tenantId}`,
      Prisma.sql`("name" ILIKE ${pattern} OR "sku" ILIKE ${pattern} OR "specs"::text ILIKE ${pattern})`,
    ];
    if (!query.includeInactive) {
      conditions.push(Prisma.sql`"isActive" = true`);
    }
    if (query.categoryId) {
      conditions.push(Prisma.sql`"categoryId" = ${query.categoryId}`);
    }

    return this.prisma.$queryRaw<Product[]>(
      Prisma.sql`
        SELECT * FROM "products"
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY "name" ASC
        LIMIT ${query.limit ?? 50}
        OFFSET ${query.offset ?? 0}
      `,
    );
  }
}
