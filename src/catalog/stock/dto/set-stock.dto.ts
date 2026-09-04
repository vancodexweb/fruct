import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class SetStockDto {
  @ApiProperty({
    description: 'Точный остаток товара на складе (не приращение)',
    minimum: 0,
    example: 12,
  })
  @IsInt()
  @Min(0)
  quantity: number;
}
