import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDeliveryOptionDto {
  @ApiProperty({ example: 'Курьером по городу' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ minimum: 0, example: 500 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ minimum: 0, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  etaDays?: number;

  @ApiPropertyOptional({ example: 'Доставка в пределах МКАД, оплата при получении' })
  @IsOptional()
  @IsString()
  conditions?: string;
}
