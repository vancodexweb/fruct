import { ApiProperty } from '@nestjs/swagger';

export class TopProductDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  totalQuantity: number;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  totalRevenue: string;
}
