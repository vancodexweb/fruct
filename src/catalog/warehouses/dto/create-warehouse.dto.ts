import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Склад №1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Самара' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ example: 'ул. Промышленности, 15' })
  @IsOptional()
  @IsString()
  address?: string;
}
