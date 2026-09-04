import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaClient } from '../../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../../common/prisma/prisma.constants';
import { CreateDeliveryOptionDto } from './dto/create-delivery-option.dto';
import { DeliveryOptionResponseDto } from './dto/delivery-option-response.dto';
import { UpdateDeliveryOptionDto } from './dto/update-delivery-option.dto';

@Injectable()
export class DeliveryOptionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
  ) {}

  async create(dto: CreateDeliveryOptionDto): Promise<DeliveryOptionResponseDto> {
    const option = await this.prisma.deliveryOption.create({
      data: {
        tenantId: this.currentTenant.tenantId,
        name: dto.name,
        price: dto.price,
        etaDays: dto.etaDays,
        conditions: dto.conditions,
      },
    });
    return DeliveryOptionResponseDto.fromEntity(option);
  }

  async findAll(): Promise<DeliveryOptionResponseDto[]> {
    const options = await this.prisma.deliveryOption.findMany({ orderBy: { name: 'asc' } });
    return options.map(DeliveryOptionResponseDto.fromEntity);
  }

  async update(id: string, dto: UpdateDeliveryOptionDto): Promise<DeliveryOptionResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.deliveryOption.update({
      where: { id },
      data: { name: dto.name, price: dto.price, etaDays: dto.etaDays, conditions: dto.conditions },
    });
    return DeliveryOptionResponseDto.fromEntity(updated);
  }

  /**
   * No soft-delete flag in the schema for DeliveryOption either. Deal.deliveryOptionId
   * is an optional field with no explicit onDelete, so Prisma's generated
   * migration defaults it to ON DELETE SET NULL (verified against the actual
   * migration SQL) — existing deals just lose the reference, the delete isn't blocked.
   */
  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.deliveryOption.delete({ where: { id } });
  }

  private async findOrThrow(id: string) {
    const option = await this.prisma.deliveryOption.findUnique({ where: { id } });
    if (!option) {
      throw new NotFoundException('Условие доставки не найдено.');
    }
    return option;
  }
}
