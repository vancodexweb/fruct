import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeliveryCalcService } from './delivery-calc.service';
import { CreateManualDeliveryQuoteDto } from './dto/create-manual-delivery-quote.dto';
import { DeliveryCalcQuoteDto, DeliveryCalcResponseDto } from './dto/delivery-calc-response.dto';
import { DeliveryCalcRequestDto } from './dto/delivery-calc-request.dto';

@ApiTags('delivery-calc')
@ApiBearerAuth()
@Controller('delivery-calc')
export class DeliveryCalcController {
  constructor(private readonly deliveryCalcService: DeliveryCalcService) {}

  @Post('quote')
  @ApiOperation({
    summary: 'Рассчитать варианты доставки по товарам, городу клиента и типу покупателя',
  })
  @ApiResponse({ status: 200, type: DeliveryCalcResponseDto })
  @ApiResponse({ status: 409, description: 'Ни на одном складе нет полного комплекта товаров.' })
  quote(@Body() dto: DeliveryCalcRequestDto): Promise<DeliveryCalcResponseDto> {
    return this.deliveryCalcService.quote(dto);
  }

  @Post('manual-quote')
  @ApiOperation({
    summary: 'Зафиксировать вручную известную стоимость межгородской доставки (без DeepSeek)',
  })
  @ApiResponse({ status: 201, type: DeliveryCalcQuoteDto })
  createManualQuote(@Body() dto: CreateManualDeliveryQuoteDto): Promise<DeliveryCalcQuoteDto> {
    return this.deliveryCalcService.createManualQuote(dto);
  }
}
