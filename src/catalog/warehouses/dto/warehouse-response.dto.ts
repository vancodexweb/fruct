import { ApiProperty } from '@nestjs/swagger';
import { Warehouse } from '@prisma/client';

export class WarehouseResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  city: string;

  @ApiProperty({ nullable: true, required: false })
  address: string | null;

  @ApiProperty()
  isActive: boolean;

  static fromEntity(warehouse: Warehouse): WarehouseResponseDto {
    const dto = new WarehouseResponseDto();
    dto.id = warehouse.id;
    dto.name = warehouse.name;
    dto.city = warehouse.city;
    dto.address = warehouse.address;
    dto.isActive = warehouse.isActive;
    return dto;
  }
}
