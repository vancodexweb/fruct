import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryQuoteSource } from '@prisma/client';
import { DeliveryOptionResponseDto } from '../../catalog/delivery-options/dto/delivery-option-response.dto';

export class DeliveryCalcQuoteDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  cost: string;

  @ApiProperty()
  etaDaysMin: number;

  @ApiProperty()
  etaDaysMax: number;

  @ApiProperty()
  isApproximate: boolean;

  @ApiProperty({ enum: DeliveryQuoteSource })
  source: DeliveryQuoteSource;
}

export class DeliveryCalcVariantDto {
  @ApiProperty()
  warehouseId: string;

  @ApiProperty()
  warehouseName: string;

  @ApiProperty()
  warehouseCity: string;

  @ApiProperty({ description: 'Город склада совпадает с городом клиента — локальная доставка' })
  isLocal: boolean;

  @ApiPropertyOptional({
    type: [DeliveryOptionResponseDto],
    description: 'Варианты локальной доставки (только когда isLocal = true)',
  })
  localDeliveryOptions?: DeliveryOptionResponseDto[];

  @ApiPropertyOptional({
    type: DeliveryCalcQuoteDto,
    description: 'Оценка межгородской доставки (только когда isLocal = false и оценка удалась)',
  })
  quote?: DeliveryCalcQuoteDto;

  @ApiPropertyOptional({
    description:
      'Причина, по которой межгородская оценка недоступна (только когда isLocal = false и оценка не удалась)',
  })
  quoteUnavailableReason?: string;
}

export class DeliveryCalcResponseDto {
  @ApiProperty({ description: 'Сумма товаров без учёта доставки, строка с десятичным значением' })
  subtotal: string;

  @ApiProperty({ description: 'Надбавка для юрлица с НДС, строка с десятичным значением' })
  legalEntityMarkup: string;

  @ApiProperty({ description: 'Суммарный вес заказа, кг' })
  totalWeightKg: string;

  @ApiProperty({
    type: [DeliveryCalcVariantDto],
    description: 'Отсортировано: локальные склады → по сроку → по цене',
  })
  variants: DeliveryCalcVariantDto[];
}
