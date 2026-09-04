import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BuyerType } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { DeliveryCalcItemDto } from './delivery-calc-item.dto';

export class DeliveryCalcRequestDto {
  @ApiProperty({ type: [DeliveryCalcItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Список товаров не может быть пустым.' })
  @ValidateNested({ each: true })
  @Type(() => DeliveryCalcItemDto)
  items: DeliveryCalcItemDto[];

  @ApiProperty({ example: 'Москва' })
  @IsString()
  @IsNotEmpty()
  destinationCity: string;

  @ApiProperty({ enum: BuyerType })
  @IsEnum(BuyerType)
  buyerType: BuyerType;

  @ApiProperty()
  @IsBoolean()
  requiresVatInvoice: boolean;
}
