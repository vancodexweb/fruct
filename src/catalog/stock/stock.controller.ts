import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { SetStockDto } from './dto/set-stock.dto';
import { StockResponseDto } from './dto/stock-response.dto';
import { StockService } from './stock.service';

@ApiTags('catalog/stock')
@ApiBearerAuth()
@Controller()
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('warehouses/:warehouseId/stock')
  @ApiOperation({ summary: 'Остатки всех товаров на складе' })
  @ApiResponse({ status: 200, type: [StockResponseDto] })
  listByWarehouse(@Param('warehouseId') warehouseId: string): Promise<StockResponseDto[]> {
    return this.stockService.listByWarehouse(warehouseId);
  }

  @Get('products/:productId/stock')
  @ApiOperation({ summary: 'Остатки товара по всем складам' })
  @ApiResponse({ status: 200, type: [StockResponseDto] })
  listByProduct(@Param('productId') productId: string): Promise<StockResponseDto[]> {
    return this.stockService.listByProduct(productId);
  }

  @Put('warehouses/:warehouseId/stock/:productId')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Установить точный остаток товара на складе' })
  @ApiResponse({ status: 200, type: StockResponseDto })
  setQuantity(
    @Param('warehouseId') warehouseId: string,
    @Param('productId') productId: string,
    @Body() dto: SetStockDto,
  ): Promise<StockResponseDto> {
    return this.stockService.setQuantity(warehouseId, productId, dto);
  }
}
