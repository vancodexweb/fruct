import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateDealItemDto } from './create-deal-item.dto';

export class CreateDealDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  leadId: string;

  @ApiProperty({ description: 'Склад отгрузки — должен иметь остатки по всем позициям' })
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ type: [CreateDealItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Список товаров в сделке не может быть пустым.' })
  @ValidateNested({ each: true })
  @Type(() => CreateDealItemDto)
  items: CreateDealItemDto[];

  @ApiPropertyOptional({
    minimum: 0,
    default: 0,
    description:
      'Скидка в рублях (не в процентах); для MANAGER ограничена его maxDiscountPercent от суммы товаров',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresVatInvoice?: boolean;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description:
      'Локальная доставка: ID варианта из /delivery-options. Укажите не более одного из deliveryOptionId / deliveryQuoteId / deliveryCost.',
  })
  @IsOptional()
  @IsString()
  deliveryOptionId?: string;

  @ApiPropertyOptional({
    description:
      'Межгородская доставка: ID оценки из /delivery-calc/quote или /delivery-calc/manual-quote.',
  })
  @IsOptional()
  @IsString()
  deliveryQuoteId?: string;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      'Ручная фиксированная стоимость доставки, если не используется ни одно из полей выше.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryCost?: number;
}
