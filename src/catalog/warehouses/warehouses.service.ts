import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaClient } from '../../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../../common/prisma/prisma.constants';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseResponseDto } from './dto/warehouse-response.dto';

@Injectable()
export class WarehousesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
  ) {}

  async create(dto: CreateWarehouseDto): Promise<WarehouseResponseDto> {
    const warehouse = await this.prisma.warehouse.create({
      data: {
        tenantId: this.currentTenant.tenantId,
        name: dto.name,
        city: dto.city,
        address: dto.address,
      },
    });
    return WarehouseResponseDto.fromEntity(warehouse);
  }

  async findAll(includeInactive = false): Promise<WarehouseResponseDto[]> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
    return warehouses.map(WarehouseResponseDto.fromEntity);
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<WarehouseResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: { name: dto.name, city: dto.city, address: dto.address },
    });
    return WarehouseResponseDto.fromEntity(updated);
  }

  /**
   * Soft delete: Stock rows cascade-delete when their Warehouse is removed
   * (see schema), which would silently wipe inventory history. Deactivating
   * instead keeps that history and matches the Product/User pattern.
   */
  async deactivate(id: string): Promise<WarehouseResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
    return WarehouseResponseDto.fromEntity(updated);
  }

  async reactivate(id: string): Promise<WarehouseResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.warehouse.update({ where: { id }, data: { isActive: true } });
    return WarehouseResponseDto.fromEntity(updated);
  }

  /** Used by StockService to confirm a warehouseId actually belongs to the current tenant. */
  async findOrThrow(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('Склад не найден.');
    }
    return warehouse;
  }
}
