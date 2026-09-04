import { Inject, Injectable } from '@nestjs/common';
import { TenantPrismaClient } from '../../common/prisma/create-tenant-prisma-client';
import { TENANT_PRISMA } from '../../common/prisma/prisma.constants';
import { ProductsService } from '../products/products.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { SetStockDto } from './dto/set-stock.dto';
import { StockResponseDto } from './dto/stock-response.dto';

/**
 * Stock has no tenantId column (see common/prisma/tenant-scoped-models.ts) —
 * it's scoped indirectly through its Warehouse/Product. Every method here
 * MUST resolve the parent through WarehousesService/ProductsService first
 * (both tenant-scoped, both 404 on a cross-tenant id) before touching Stock,
 * or a request could read/write another tenant's inventory.
 */
@Injectable()
export class StockService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly warehousesService: WarehousesService,
    private readonly productsService: ProductsService,
  ) {}

  async listByWarehouse(warehouseId: string): Promise<StockResponseDto[]> {
    await this.warehousesService.findOrThrow(warehouseId);
    const stocks = await this.prisma.stock.findMany({
      where: { warehouseId },
      include: { product: true },
      orderBy: { product: { name: 'asc' } },
    });
    return stocks.map(StockResponseDto.fromEntity);
  }

  async listByProduct(productId: string): Promise<StockResponseDto[]> {
    await this.productsService.findOrThrow(productId);
    const stocks = await this.prisma.stock.findMany({
      where: { productId },
      include: { warehouse: true },
      orderBy: { warehouse: { name: 'asc' } },
    });
    return stocks.map(StockResponseDto.fromEntity);
  }

  async setQuantity(
    warehouseId: string,
    productId: string,
    dto: SetStockDto,
  ): Promise<StockResponseDto> {
    await this.warehousesService.findOrThrow(warehouseId);
    await this.productsService.findOrThrow(productId);

    const stock = await this.prisma.stock.upsert({
      where: { warehouseId_productId: { warehouseId, productId } },
      create: { warehouseId, productId, quantity: dto.quantity },
      update: { quantity: dto.quantity },
      include: { product: true, warehouse: true },
    });
    return StockResponseDto.fromEntity(stock);
  }
}
