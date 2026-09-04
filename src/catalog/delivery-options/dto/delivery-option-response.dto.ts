import { ApiProperty } from '@nestjs/swagger';
import { DeliveryOption } from '@prisma/client';

export class DeliveryOptionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  price: string;

  @ApiProperty({ nullable: true, required: false })
  etaDays: number | null;

  @ApiProperty({ nullable: true, required: false })
  conditions: string | null;

  static fromEntity(option: DeliveryOption): DeliveryOptionResponseDto {
    const dto = new DeliveryOptionResponseDto();
    dto.id = option.id;
    dto.name = option.name;
    dto.price = option.price.toString();
    dto.etaDays = option.etaDays;
    dto.conditions = option.conditions;
    return dto;
  }
}
