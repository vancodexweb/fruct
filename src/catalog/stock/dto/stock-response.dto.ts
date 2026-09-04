import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Product, Stock, Warehouse } from '@prisma/client';

class StockProductSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  sku: string | null;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  price: string;
}

class StockWarehouseSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  city: string;
}

export class StockResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  warehouseId: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  quantity: number;

  @ApiPropertyOptional({ type: StockProductSummaryDto })
  product?: StockProductSummaryDto;

  @ApiPropertyOptional({ type: StockWarehouseSummaryDto })
  warehouse?: StockWarehouseSummaryDto;

  static fromEntity(stock: Stock & { product?: Product; warehouse?: Warehouse }): StockResponseDto {
    const dto = new StockResponseDto();
    dto.id = stock.id;
    dto.warehouseId = stock.warehouseId;
    dto.productId = stock.productId;
    dto.quantity = stock.quantity;
    if (stock.product) {
      dto.product = {
        id: stock.product.id,
        name: stock.product.name,
        sku: stock.product.sku,
        price: stock.product.price.toString(),
      };
    }
    if (stock.warehouse) {
      dto.warehouse = {
        id: stock.warehouse.id,
        name: stock.warehouse.name,
        city: stock.warehouse.city,
      };
    }
    return dto;
  }
}
